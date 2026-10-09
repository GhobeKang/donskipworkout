import asyncio
import logging
from datetime import datetime, timedelta, timezone

import firebase_admin
import httpx
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
from .notification_service import next_allowed_send_at

logger = logging.getLogger(__name__)
worker_poll_seconds = 10
worker_batch_size = 25
max_delivery_attempts = 3
retry_delays = (timedelta(minutes=1), timedelta(minutes=5))


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
            credential=firebase_credentials,
            options={'projectId': project_id, 'httpTimeout': 10}
        )


def build_fcm_message(event: notificationEvent, device: pushDevice):
    data = {
        key: str(value)
        for key, value in event.payload.items()
        if isinstance(value, (str, int, float, bool))
    }
    data['event_uuid'] = event.event_uuid
    data['category'] = event.category
    return messaging.Message(
        token=device.token,
        notification=messaging.Notification(title=event.title, body=event.body),
        data=data,
        android=messaging.AndroidConfig(priority='high'),
    )


def deliver_due_notifications(session_factory, firebase_app, apns_sender) -> int:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    enabled_providers = []
    if firebase_app is not None:
        enabled_providers.append('fcm')
    if apns_sender is not None:
        enabled_providers.append('apns')
    with session_factory() as database:
        deliveries = database.execute(
            select(notificationOutbox, notificationEvent, pushDevice)
            .join(notificationEvent, notificationEvent.event_id == notificationOutbox.event_id)
            .join(pushDevice, pushDevice.device_id == notificationOutbox.device_id)
            .where(
                notificationOutbox.status == 'queued',
                notificationOutbox.next_attempt_at <= now,
                pushDevice.provider.in_(enabled_providers),
            )
            .order_by(notificationOutbox.outbox_id)
            .limit(worker_batch_size)
            .with_for_update(skip_locked=True, of=notificationOutbox)
        ).all()

        for outbox, event, device in deliveries:
            if not device.active:
                outbox.status = 'cancelled'
                outbox.last_error = 'device_inactive'
                continue
            preference = database.scalar(
                select(notificationPreference).where(
                    notificationPreference.round_id == event.round_id,
                    notificationPreference.user_id == device.user_id,
                )
            ) if event.round_id is not None else None
            account = database.get(userAccount, device.user_id)
            next_attempt_at = next_allowed_send_at(
                now, preference, account.timezone if account else 'Asia/Seoul'
            )
            if next_attempt_at > now:
                outbox.next_attempt_at = next_attempt_at
                continue
            try:
                if device.provider == 'fcm':
                    outbox.provider_message_id = messaging.send(
                        build_fcm_message(event, device), app=firebase_app
                    )[:200]
                    outbox.attempt_count += 1
                    outbox.status = 'provider_accepted'
                    outbox.last_error = None
                else:
                    response = apns_sender.send(event, device)
                    outbox.attempt_count += 1
                    if response.status_code == 200:
                        outbox.provider_message_id = response.headers.get('apns-id', '')[:200]
                        outbox.status = 'provider_accepted'
                        outbox.last_error = None
                    else:
                        try:
                            reason = response.json().get('reason', 'apns_error')
                        except (ValueError, AttributeError):
                            reason = 'apns_error'
                        outbox.last_error = str(reason)[:200]
                        if reason == 'Unregistered':
                            device.active = False
                            outbox.status = 'cancelled'
                        elif 400 <= response.status_code < 500 and response.status_code != 429:
                            outbox.status = 'failed'
                        elif outbox.attempt_count >= max_delivery_attempts:
                            outbox.status = 'failed'
                        else:
                            outbox.next_attempt_at = now + retry_delays[outbox.attempt_count - 1]
                        logger.warning(
                            'APNs delivery failed for outbox %s with status %s and reason %s',
                            outbox.outbox_id, response.status_code, outbox.last_error,
                        )
            except messaging.UnregisteredError:
                device.active = False
                outbox.attempt_count = min(outbox.attempt_count + 1, max_delivery_attempts)
                outbox.status = 'cancelled'
                outbox.last_error = 'unregistered_token'
            except FirebaseError as error:
                outbox.attempt_count = min(outbox.attempt_count + 1, max_delivery_attempts)
                outbox.last_error = str(error.code or 'firebase_error')[:200]
                if outbox.attempt_count >= max_delivery_attempts:
                    outbox.status = 'failed'
                else:
                    outbox.next_attempt_at = now + retry_delays[outbox.attempt_count - 1]
                logger.warning(
                    'FCM delivery failed for outbox %s with code %s',
                    outbox.outbox_id,
                    outbox.last_error,
                )
            except httpx.HTTPError as error:
                outbox.attempt_count = min(outbox.attempt_count + 1, max_delivery_attempts)
                outbox.last_error = type(error).__name__[:200]
                if outbox.attempt_count >= max_delivery_attempts:
                    outbox.status = 'failed'
                else:
                    outbox.next_attempt_at = now + retry_delays[outbox.attempt_count - 1]
                logger.warning(
                    'APNs delivery failed for outbox %s with %s',
                    outbox.outbox_id, outbox.last_error,
                )
            except Exception as error:
                outbox.attempt_count = min(outbox.attempt_count + 1, max_delivery_attempts)
                outbox.last_error = type(error).__name__[:200]
                if outbox.attempt_count >= max_delivery_attempts:
                    outbox.status = 'failed'
                else:
                    outbox.next_attempt_at = now + retry_delays[outbox.attempt_count - 1]
                logger.warning(
                    'FCM delivery failed for outbox %s with %s',
                    outbox.outbox_id,
                    outbox.last_error,
                )

        database.commit()
        return len(deliveries)


async def run_notification_worker(
    session_factory,
    project_id: str | None,
    credentials_path: str | None = None,
    apns_key_id: str | None = None,
    apns_team_id: str | None = None,
    apns_auth_key_path: str | None = None,
    apns_topic: str | None = None,
    apns_environment: str = 'production',
):
    firebase_app = None
    apns_sender = None
    if project_id:
        try:
            firebase_app = await asyncio.to_thread(
                initialize_firebase_app, project_id, credentials_path
            )
        except Exception as error:
            logger.error('FCM worker could not initialize: %s', type(error).__name__)
    if apns_key_id:
        try:
            apns_sender = await asyncio.to_thread(
                apnsSender, apns_key_id, apns_team_id, apns_auth_key_path,
                apns_topic, apns_environment,
            )
        except Exception as error:
            logger.error('APNs worker could not initialize: %s', type(error).__name__)
    if firebase_app is None and apns_sender is None:
        return

    try:
        while True:
            try:
                delivery_task = asyncio.create_task(
                    asyncio.to_thread(
                        deliver_due_notifications, session_factory, firebase_app, apns_sender
                    )
                )
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
                logger.error('Push worker batch failed: %s', type(error).__name__)
            await asyncio.sleep(worker_poll_seconds)
    finally:
        if apns_sender is not None:
            await asyncio.to_thread(apns_sender.close)
