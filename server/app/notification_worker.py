import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone

import firebase_admin
from firebase_admin import credentials, messaging
from firebase_admin.exceptions import FirebaseError
from sqlalchemy import select

from .apns import apnsSender
from .database import (
    notificationEvent,
    notificationOutbox,
    notificationPreference,
    pushDevice,
    userAccount,
)
from .notification_catalog import read_notification_catalog
from .notification_service import next_allowed_send_at
from .workout_notifications import (
    enqueue_due_workout_notifications,
    notification_cancellation_reason,
    parse_notification_time,
    workout_category,
)

logger = logging.getLogger(__name__)
worker_poll_seconds = 10
worker_batch_size = 25
max_delivery_attempts = 3
retry_delays = (timedelta(minutes=1), timedelta(minutes=5))
delivery_lease = timedelta(minutes=2)


def initialize_firebase_app(project_id: str, credentials_path: str | None = None):
    try:
        return firebase_admin.get_app()
    except ValueError:
        firebase_credentials = (
            credentials.Certificate(credentials_path)
            if credentials_path
            else credentials.ApplicationDefault()
        )
        return firebase_admin.initialize_app(
            credential=firebase_credentials, options={'projectId': project_id, 'httpTimeout': 10}
        )


def build_fcm_message(event: notificationEvent, device: pushDevice, now=None):
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    data = {
        key: str(value)
        for key, value in event.payload.items()
        if isinstance(value, (str, int, float, bool)) and key not in {'title_en', 'body_en'}
    }
    data.update({'event_uuid': event.event_uuid, 'category': event.category})
    expires_at = parse_notification_time(event.payload.get('expires_at'))
    ttl = max(expires_at - now, timedelta(0)) if expires_at else timedelta(hours=24)
    english = device.language == 'en'
    title = event.payload.get('title_en', event.title) if english else event.title
    body = event.payload.get('body_en', event.body) if english else event.body
    return messaging.Message(
        token=device.token,
        notification=messaging.Notification(title=title, body=body),
        data=data,
        android=messaging.AndroidConfig(
            priority='high',
            ttl=ttl,
            notification=messaging.AndroidNotification(
                channel_id='workout-push'
                if (
                    event.category == workout_category
                    or (
                        event.category == 'push_test'
                        and event.payload.get('channel_id') == 'workout-push'
                    )
                )
                else 'server-push',
                tag=event.event_uuid,
                icon='ic_stat_attendance',
                sound='default',
            ),
        ),
    )


def claim_due_notification(session_factory, enabled_providers, now):
    with session_factory() as database:
        row = database.execute(
            select(notificationOutbox, notificationEvent, pushDevice)
            .join(notificationEvent, notificationEvent.event_id == notificationOutbox.event_id)
            .join(pushDevice, pushDevice.device_id == notificationOutbox.device_id)
            .where(
                notificationOutbox.status.in_(['queued', 'processing']),
                notificationOutbox.next_attempt_at <= now,
                pushDevice.provider.in_(enabled_providers),
            )
            .order_by(notificationOutbox.next_attempt_at, notificationOutbox.outbox_id)
            .limit(1)
            .with_for_update(skip_locked=True, of=notificationOutbox)
        ).first()
        if row is None:
            return None
        outbox, event, device = row
        reason = notification_cancellation_reason(database, event, device, now)
        if reason or outbox.attempt_count >= max_delivery_attempts:
            outbox.status = 'cancelled' if reason else 'failed'
            outbox.last_error = reason or 'delivery_attempt_limit'
            database.commit()
            logger.info(
                'Push delivery skipped event_uuid=%s outbox_id=%s reason=%s',
                event.event_uuid,
                outbox.outbox_id,
                outbox.last_error,
            )
            return {'skipped': True}
        if event.round_id is not None:
            preference = database.scalar(
                select(notificationPreference).where(
                    notificationPreference.round_id == event.round_id,
                    notificationPreference.user_id == device.user_id,
                )
            )
            account = database.get(userAccount, device.user_id)
            next_allowed = next_allowed_send_at(
                now, preference, account.timezone if account else 'Asia/Seoul'
            )
            if next_allowed > now:
                outbox.status = 'queued'
                outbox.next_attempt_at = next_allowed
                database.commit()
                return {'skipped': True}
        outbox.status = 'processing'
        outbox.attempt_count += 1
        outbox.next_attempt_at = now + delivery_lease
        database.commit()
        # No database connection or row lock is held during the provider request.
        return {
            'outbox_id': outbox.outbox_id,
            'attempt_count': outbox.attempt_count,
            'event': event,
            'device': device,
        }


def finish_delivery(
    session_factory, claim, status, message_id=None, error_code=None, invalidate=False
):
    with session_factory() as database:
        outbox = database.scalar(
            select(notificationOutbox)
            .where(
                notificationOutbox.outbox_id == claim['outbox_id'],
                notificationOutbox.status == 'processing',
                notificationOutbox.attempt_count == claim['attempt_count'],
            )
            .with_for_update()
        )
        if outbox is None:
            return
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if status == 'queued' and outbox.attempt_count >= max_delivery_attempts:
            status = 'failed'
        outbox.status = status
        outbox.provider_message_id = str(message_id)[:200] if message_id else None
        outbox.last_error = str(error_code)[:200] if error_code else None
        if status == 'queued':
            outbox.next_attempt_at = now + retry_delays[outbox.attempt_count - 1]
        if invalidate:
            device = database.get(pushDevice, claim['device'].device_id)
            if device and device.token == claim['device'].token:
                device.active = False
        database.commit()


def deliver_due_notifications(session_factory, firebase_app, apns_sender) -> int:
    enabled_providers = []
    if firebase_app is not None:
        enabled_providers.append('fcm')
    if apns_sender is not None:
        enabled_providers.append('apns')
    if not enabled_providers:
        return 0
    processed_count = 0
    batch_started_at = time.monotonic()
    for _ in range(worker_batch_size):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        claim = claim_due_notification(session_factory, enabled_providers, now)
        if claim is None:
            break
        processed_count += 1
        if claim.get('skipped'):
            continue
        event, device = claim['event'], claim['device']
        status, message_id, error_code, invalidate = 'provider_accepted', None, None, False
        try:
            if device.provider == 'fcm':
                message_id = messaging.send(build_fcm_message(event, device), app=firebase_app)
            else:
                response = apns_sender.send(event, device)
                if response.status_code == 200:
                    message_id = response.headers.get('apns-id')
                else:
                    try:
                        error_code = response.json().get('reason', 'apns_error')
                    except (ValueError, AttributeError):
                        error_code = 'apns_error'
                    invalidate = error_code == 'Unregistered'
                    status = (
                        'cancelled'
                        if invalidate
                        else (
                            'failed'
                            if 400 <= response.status_code < 500 and response.status_code != 429
                            else 'queued'
                        )
                    )
        except messaging.UnregisteredError:
            status, error_code, invalidate = 'cancelled', 'unregistered_token', True
        except FirebaseError as error:
            error_code = error.code or 'firebase_error'
            status = (
                'failed'
                if error_code
                in {'INVALID_ARGUMENT', 'PERMISSION_DENIED', 'SENDER_ID_MISMATCH', 'NOT_FOUND'}
                else 'queued'
            )
        except Exception as error:
            status, error_code = 'queued', type(error).__name__
        finish_delivery(session_factory, claim, status, message_id, error_code, invalidate)
        log_delivery = logger.warning if error_code else logger.info
        log_delivery(
            'Push delivery result event_uuid=%s outbox_id=%s provider=%s status=%s '
            'attempt_count=%s message_id=%s error_code=%s',
            event.event_uuid,
            claim['outbox_id'],
            device.provider,
            status,
            claim['attempt_count'],
            message_id or '-',
            error_code or '-',
        )
        if time.monotonic() - batch_started_at >= worker_poll_seconds:
            break
    return processed_count


async def run_notification_worker(
    session_factory,
    project_id: str | None,
    credentials_path: str | None = None,
    apns_key_id: str | None = None,
    apns_team_id: str | None = None,
    apns_auth_key_path: str | None = None,
    apns_topic: str | None = None,
    apns_environment: str = 'production',
    catalog_path=None,
    worker_state=None,
):
    worker_state = worker_state if worker_state is not None else {}
    worker_state.update(
        {'running': False, 'fcm_initialized': False, 'apns_initialized': False, 'last_error': None}
    )
    firebase_app, apns_sender = None, None
    if project_id:
        try:
            firebase_app = await asyncio.to_thread(
                initialize_firebase_app, project_id, credentials_path
            )
            worker_state['fcm_initialized'] = True
        except Exception as error:
            worker_state['last_error'] = 'fcm_initialization_failed'
            logger.error('FCM worker could not initialize: %s', type(error).__name__)
    if apns_key_id:
        try:
            apns_sender = await asyncio.to_thread(
                apnsSender,
                apns_key_id,
                apns_team_id,
                apns_auth_key_path,
                apns_topic,
                apns_environment,
            )
            worker_state['apns_initialized'] = True
        except Exception as error:
            worker_state['last_error'] = 'apns_initialization_failed'
            logger.error('APNs worker could not initialize: %s', type(error).__name__)
    if firebase_app is None and apns_sender is None:
        return
    worker_state['running'] = True
    enabled_providers = (['fcm'] if firebase_app is not None else []) + (
        ['apns'] if apns_sender else []
    )

    initialization_error = worker_state['last_error']

    def process_batch():
        batch_error = initialization_error
        if catalog_path:
            try:
                catalog = read_notification_catalog(catalog_path).model_dump()
                enqueue_due_workout_notifications(session_factory, catalog, enabled_providers)
                worker_state['last_schedule_at'] = datetime.now(timezone.utc).isoformat()
            except Exception as error:
                batch_error = 'workout_schedule_failed'
                logger.error('Workout scheduler failed: %s', type(error).__name__)
        count = deliver_due_notifications(session_factory, firebase_app, apns_sender)
        worker_state['last_delivery_at'] = datetime.now(timezone.utc).isoformat()
        worker_state['last_error'] = batch_error
        return count

    try:
        while True:
            try:
                delivery_task = asyncio.create_task(asyncio.to_thread(process_batch))
                try:
                    delivered_count = await asyncio.shield(delivery_task)
                except asyncio.CancelledError:
                    await delivery_task
                    raise
                if delivered_count:
                    logger.info('Push worker processed %s queued notifications', delivered_count)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                worker_state['last_error'] = 'push_batch_failed'
                logger.error('Push worker batch failed: %s', type(error).__name__)
            await asyncio.sleep(worker_poll_seconds)
    finally:
        worker_state['running'] = False
        if apns_sender is not None:
            await asyncio.to_thread(apns_sender.close)
