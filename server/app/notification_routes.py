import logging
from datetime import datetime, time, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import func, or_, select

from .community_policy import community_policy_version
from .community_safety import blocked_user_ids, require_room_visible, users_are_blocked
from .database import (
    challengeCheckin,
    challengePeriod,
    challengeRoom,
    challengeRound,
    challengeRoundMember,
    notificationEvent,
    notificationInbox,
    notificationOutbox,
    notificationPreference,
    pushDevice,
    userAccount,
)
from .notification_service import device_token_hash, next_allowed_send_at
from .schemas import (
    challengeNudgeRequest,
    notificationPreferenceUpdate,
    pushDeviceRegistration,
    pushTestRequest,
)
from .security import databaseDependency, userDependency, utc_now
from .workout_notifications import parse_notification_time

router = APIRouter(prefix='/api/v1')
logger = logging.getLogger(__name__)


def get_member_round(database, round_uuid: UUID, user_id: int):
    result = database.execute(
        select(challengeRound, challengeRoundMember)
        .join(challengeRoundMember, challengeRoundMember.round_id == challengeRound.round_id)
        .join(challengeRoom, challengeRoom.room_id == challengeRound.room_id)
        .where(
            challengeRound.round_uuid == str(round_uuid),
            challengeRoundMember.user_id == user_id,
            challengeRoom.status != 'cancelled',
        )
    ).first()
    if result is None:
        raise HTTPException(404, '방을 찾을 수 없습니다.')
    require_room_visible(database, user_id, database.get(challengeRoom, result[0].room_id))
    return result


def preference_output(preference: notificationPreference):
    return {
        'room_news_enabled': preference.room_news_enabled,
        'host_nudge_enabled': preference.host_nudge_enabled,
        'quiet_start': preference.quiet_start.strftime('%H:%M'),
        'quiet_end': preference.quiet_end.strftime('%H:%M'),
        'timezone': preference.timezone,
    }


@router.get('/notifications/inbox')
def read_notification_inbox(
    user: userDependency,
    database: databaseDependency,
    limit: int = Query(default=30, ge=1, le=100),
):
    blocked_ids = blocked_user_ids(database, user.user_id)
    rows = database.execute(
        select(notificationEvent, notificationInbox)
        .join(notificationInbox, notificationInbox.event_id == notificationEvent.event_id)
        .outerjoin(challengeRound, challengeRound.round_id == notificationEvent.round_id)
        .outerjoin(challengeRoom, challengeRoom.room_id == challengeRound.room_id)
        .where(
            notificationInbox.user_id == user.user_id,
            or_(notificationEvent.sender_user_id.is_(None),
                notificationEvent.sender_user_id.not_in(blocked_ids)),
            or_(challengeRoom.host_user_id.is_(None),
                challengeRoom.host_user_id.not_in(blocked_ids)),
            or_(notificationEvent.round_id.is_(None), challengeRoom.status != 'cancelled'),
        )
        .order_by(notificationEvent.created_at.desc(), notificationEvent.event_id.desc())
        .limit(limit)
    ).all()
    return {
        'notifications': [
            {
                'notification_uuid': event.event_uuid,
                'category': event.category,
                'title': event.title,
                'body': event.body,
                'created_at': event.created_at.isoformat() + 'Z',
                'read_at': inbox.read_at.isoformat() + 'Z' if inbox.read_at else None,
                **event.payload,
            }
            for event, inbox in rows
        ]
    }


@router.put('/notifications/inbox/{notification_uuid}/read', status_code=204)
def mark_notification_read(
    notification_uuid: UUID,
    user: userDependency,
    database: databaseDependency,
):
    row = database.execute(
        select(notificationInbox, notificationEvent)
        .join(notificationEvent, notificationEvent.event_id == notificationInbox.event_id)
        .where(
            notificationEvent.event_uuid == str(notification_uuid),
            notificationInbox.user_id == user.user_id,
        )
        .with_for_update()
    ).first()
    if row is None:
        raise HTTPException(404, '알림을 찾을 수 없습니다.')
    inbox, _ = row
    inbox.read_at = inbox.read_at or utc_now()
    database.commit()
    return None


@router.get('/challenge-rounds/{round_uuid}/notification-preferences')
def read_round_notification_preferences(
    round_uuid: UUID,
    user: userDependency,
    database: databaseDependency,
):
    current_round, _ = get_member_round(database, round_uuid, user.user_id)
    preference = database.scalar(
        select(notificationPreference).where(
            notificationPreference.round_id == current_round.round_id,
            notificationPreference.user_id == user.user_id,
        )
    )
    if preference is None:
        preference = notificationPreference(
            round_id=current_round.round_id,
            user_id=user.user_id,
            room_news_enabled=True,
            host_nudge_enabled=True,
            quiet_start=time(21),
            quiet_end=time(9),
            timezone=user.timezone,
        )
        database.add(preference)
        database.commit()
    elif not preference.room_news_enabled or not preference.host_nudge_enabled:
        preference.room_news_enabled = True
        preference.host_nudge_enabled = True
        database.commit()
    return preference_output(preference)


@router.put('/challenge-rounds/{round_uuid}/notification-preferences')
def update_round_notification_preferences(
    round_uuid: UUID,
    payload: notificationPreferenceUpdate,
    user: userDependency,
    database: databaseDependency,
):
    current_round, _ = get_member_round(database, round_uuid, user.user_id)
    preference = database.scalar(
        select(notificationPreference)
        .where(
            notificationPreference.round_id == current_round.round_id,
            notificationPreference.user_id == user.user_id,
        )
        .with_for_update()
    )
    if preference is None:
        preference = notificationPreference(
            round_id=current_round.round_id,
            user_id=user.user_id,
            timezone=user.timezone,
        )
        database.add(preference)
    preference.room_news_enabled = True
    preference.host_nudge_enabled = True
    preference.quiet_start = time.fromisoformat(payload.quiet_start)
    preference.quiet_end = time.fromisoformat(payload.quiet_end)
    preference.updated_at = utc_now()
    database.commit()
    return preference_output(preference)


@router.put('/push-devices/current')
def register_push_device(
    payload: pushDeviceRegistration,
    user: userDependency,
    database: databaseDependency,
):
    if payload.user_uuid is not None and str(payload.user_uuid) != user.user_uuid:
        raise HTTPException(401, '현재 로그인 계정으로 푸시를 다시 등록해 주세요.')
    provider = 'fcm' if payload.platform == 'android' else 'apns'
    current_token_hash = device_token_hash(payload.token)
    device = database.scalar(
        select(pushDevice)
        .where(pushDevice.provider == provider, pushDevice.token_hash == current_token_hash)
        .with_for_update()
    )
    installation_device = database.scalar(
        select(pushDevice)
        .where(
            pushDevice.user_id == user.user_id,
            pushDevice.installation_uuid == str(payload.installation_uuid),
        )
        .with_for_update()
    )
    target_device = device or installation_device
    previous_installation_devices = database.scalars(
        select(pushDevice)
        .where(pushDevice.installation_uuid == str(payload.installation_uuid))
        .with_for_update()
    ).all()
    for previous_device in previous_installation_devices:
        if previous_device is target_device:
            continue
        previous_device.active = False
        previous_device.installation_uuid = str(uuid4())
        previous_device.updated_at = utc_now()
    database.flush()
    if target_device is None:
        target_device = pushDevice(
            user_id=user.user_id,
            installation_uuid=str(payload.installation_uuid),
            platform=payload.platform,
            provider=provider,
            token=payload.token,
            token_hash=current_token_hash,
            workout_push_enabled=payload.workout_push_enabled,
            language=payload.language,
            active=True,
            updated_at=utc_now(),
        )
        database.add(target_device)
    else:
        target_device.user_id = user.user_id
        target_device.installation_uuid = str(payload.installation_uuid)
        target_device.platform = payload.platform
        target_device.provider = provider
        target_device.token = payload.token
        target_device.token_hash = current_token_hash
        target_device.workout_push_enabled = payload.workout_push_enabled
        target_device.language = payload.language
        target_device.active = True
        target_device.updated_at = utc_now()
    database.commit()
    return {
        'registered': True,
        'platform': payload.platform,
        'workout_push_enabled': target_device.workout_push_enabled,
    }


@router.delete('/push-devices/current', status_code=204)
def unregister_push_device(
    installation_uuid: UUID,
    user: userDependency,
    database: databaseDependency,
):
    devices = database.scalars(
        select(pushDevice).where(
            pushDevice.user_id == user.user_id,
            pushDevice.installation_uuid == str(installation_uuid),
            pushDevice.active.is_(True),
        )
    ).all()
    for device in devices:
        device.active = False
        device.updated_at = utc_now()
    database.commit()
    return None


@router.post('/challenge-rounds/{round_uuid}/nudges')
def send_challenge_nudges(
    round_uuid: UUID,
    payload: challengeNudgeRequest,
    user: userDependency,
    database: databaseDependency,
):
    current_round, _ = get_member_round(database, round_uuid, user.user_id)
    room = database.get(challengeRoom, current_round.room_id)
    if room.host_user_id != user.user_id:
        raise HTTPException(403, '방장만 참가자를 재촉할 수 있습니다.')
    if user.community_policy_version != community_policy_version:
        raise HTTPException(409, '커뮤니티 이용약관을 확인하고 동의해 주세요.')
    now = utc_now()
    if current_round.status != 'active':
        raise HTTPException(409, '진행 중인 회차에서만 재촉할 수 있습니다.')
    active_period = database.scalar(
        select(challengePeriod).where(
            challengePeriod.round_id == current_round.round_id,
            challengePeriod.start_at <= now,
            challengePeriod.end_at > now,
        )
    )
    if active_period is None:
        raise HTTPException(409, '현재 진행 중인 구간이 없습니다.')
    member_rows = database.execute(
        select(challengeRoundMember, userAccount)
        .join(userAccount, userAccount.user_id == challengeRoundMember.user_id)
        .where(
            challengeRoundMember.round_id == current_round.round_id,
            challengeRoundMember.participant_status == 'active',
            challengeRoundMember.user_id != user.user_id,
        )
    ).all()
    member_by_uuid = {UUID(account.user_uuid): (member, account) for member, account in member_rows}
    requested_user_uuids = set(payload.member_uuids)
    if requested_user_uuids - member_by_uuid.keys():
        raise HTTPException(422, '재촉 대상에 현재 참가자가 아닌 사용자가 포함되어 있습니다.')
    targets = [
        (user_uuid, member)
        for user_uuid, member in member_by_uuid.items()
        if not requested_user_uuids or user_uuid in requested_user_uuids
    ]
    sent_count = 0
    skipped = []
    for target_uuid, (member, account) in targets:
        if users_are_blocked(database, user.user_id, member.user_id):
            skipped.append(str(target_uuid))
            continue
        accepted_count = (
            database.scalar(
                select(func.count(challengeCheckin.checkin_id)).where(
                    challengeCheckin.period_id == active_period.period_id,
                    challengeCheckin.user_id == member.user_id,
                    challengeCheckin.status == 'accepted',
                )
            )
            or 0
        )
        if accepted_count >= active_period.target_count:
            skipped.append(str(target_uuid))
            continue
        preference = database.scalar(
            select(notificationPreference).where(
                notificationPreference.round_id == current_round.round_id,
                notificationPreference.user_id == member.user_id,
            )
        )
        recipient_timezone = ZoneInfo(preference.timezone if preference else account.timezone)
        recipient_now = now.replace(tzinfo=ZoneInfo('UTC')).astimezone(recipient_timezone)
        local_day_start = datetime.combine(recipient_now.date(), time.min, recipient_timezone)
        day_start_utc = local_day_start.astimezone(ZoneInfo('UTC')).replace(tzinfo=None)
        recent_nudges = database.scalars(
            select(notificationEvent)
            .where(
                notificationEvent.round_id == current_round.round_id,
                notificationEvent.recipient_user_id == member.user_id,
                notificationEvent.sender_user_id == user.user_id,
                notificationEvent.category == 'host_nudge',
                notificationEvent.created_at >= day_start_utc,
            )
            .order_by(notificationEvent.created_at.desc())
        ).all()
        if len(recent_nudges) >= 2 or (
            recent_nudges and recent_nudges[0].created_at > now - timedelta(hours=4)
        ):
            skipped.append(str(target_uuid))
            continue
        event_key = f'nudge:{current_round.round_uuid}:{payload.request_id}:{member.user_id}'
        existing_event = database.scalar(
            select(notificationEvent).where(notificationEvent.event_key == event_key)
        )
        if existing_event:
            sent_count += 1
            continue
        event = notificationEvent(
            event_uuid=str(uuid4()),
            event_key=event_key,
            round_id=current_round.round_id,
            recipient_user_id=member.user_id,
            sender_user_id=user.user_id,
            category='host_nudge',
            title='운동 챌린지 알림',
            body='오늘의 운동 기록을 확인해 주세요.',
            payload={
                'round_uuid': current_round.round_uuid,
                'room_uuid': room.room_uuid,
                'event_type': 'host_nudge',
            },
            created_at=now,
        )
        database.add(event)
        database.flush()
        database.add(notificationInbox(event_id=event.event_id, user_id=member.user_id))
        devices = database.scalars(
            select(pushDevice).where(
                pushDevice.user_id == member.user_id,
                pushDevice.active.is_(True),
            )
        ).all()
        next_attempt_at = next_allowed_send_at(now, preference, account.timezone)
        database.add_all(
            notificationOutbox(
                event_id=event.event_id,
                device_id=device.device_id,
                status='queued',
                attempt_count=0,
                next_attempt_at=next_attempt_at,
                created_at=now,
            )
            for device in devices
        )
        sent_count += 1
    database.commit()
    return {'accepted_count': sent_count, 'skipped_user_uuids': skipped}


@router.get('/notifications/status')
def read_push_status(request: Request, user: userDependency, database: databaseDependency):
    worker = getattr(request.app.state, 'notification_worker_state', {})
    devices = database.scalars(
        select(pushDevice).where(pushDevice.user_id == user.user_id, pushDevice.active.is_(True))
    ).all()
    latest_deliveries = database.execute(
        select(notificationOutbox.status, notificationOutbox.last_error, notificationEvent.category)
        .join(notificationEvent, notificationEvent.event_id == notificationOutbox.event_id)
        .where(notificationEvent.recipient_user_id == user.user_id)
        .order_by(notificationOutbox.outbox_id.desc())
        .limit(5)
    ).all()
    last_schedule_at = parse_notification_time(worker.get('last_schedule_at'))
    scheduler_running = bool(
        worker.get('running')
        and last_schedule_at
        and utc_now() - last_schedule_at < timedelta(minutes=2)
        and worker.get('last_error') not in {'workout_schedule_failed', 'push_batch_failed'}
    )
    return {
        'delivery_mode': 'server_push',
        'worker_running': bool(worker.get('running')),
        'fcm_initialized': bool(worker.get('fcm_initialized')),
        'apns_initialized': bool(worker.get('apns_initialized')),
        'scheduler_running': scheduler_running,
        'last_error': worker.get('last_error'),
        'registered_devices': [
            {
                'installation_uuid': device.installation_uuid,
                'platform': device.platform,
                'workout_push_enabled': device.workout_push_enabled,
            }
            for device in devices
        ],
        'recent_deliveries': [
            {
                'status': status,
                'error': error,
                'category': category,
            }
            for status, error, category in latest_deliveries
        ],
    }


@router.post('/notifications/test', status_code=202)
def queue_push_test(
    request: Request,
    user: userDependency,
    database: databaseDependency,
    installation_uuid: UUID | None = None,
    payload: pushTestRequest | None = None,
):
    payload = payload or pushTestRequest()
    if (
        installation_uuid is not None
        and payload.installation_uuid is not None
        and installation_uuid != payload.installation_uuid
    ):
        raise HTTPException(422, '조회 조건과 본문의 기기 ID가 일치하지 않습니다.')
    installation_uuid = installation_uuid or payload.installation_uuid
    worker = getattr(request.app.state, 'notification_worker_state', {})
    device_query = select(pushDevice).where(
        pushDevice.user_id == user.user_id,
        pushDevice.active.is_(True),
    )
    if installation_uuid is not None:
        device_query = device_query.where(pushDevice.installation_uuid == str(installation_uuid))
    devices = database.scalars(device_query.limit(2)).all()
    if not devices:
        raise HTTPException(409, '이 기기의 푸시 등록을 먼저 완료해 주세요.')
    if len(devices) > 1:
        raise HTTPException(422, '등록된 기기가 여러 대입니다. installation_uuid를 지정해 주세요.')
    device = devices[0]
    if not worker.get('running') or not worker.get(f'{device.provider}_initialized'):
        raise HTTPException(503, '서버 푸시 발송이 활성화되지 않았습니다.')
    # Serialize test requests per account so concurrent taps cannot bypass the limit.
    database.scalar(
        select(userAccount).where(userAccount.user_id == user.user_id).with_for_update()
    )
    now = utc_now()
    previous_test = database.scalar(
        select(notificationEvent.event_id)
        .where(
            notificationEvent.recipient_user_id == user.user_id,
            notificationEvent.category == 'push_test',
            notificationEvent.created_at > now - timedelta(minutes=1),
        )
        .limit(1)
    )
    if previous_test:
        raise HTTPException(429, '테스트 알림은 1분 뒤 다시 요청해 주세요.')
    scheduled_at = now + timedelta(seconds=payload.delay_seconds)
    channel_id = 'workout-push' if payload.channel == 'workout' else 'server-push'
    event = notificationEvent(
        event_uuid=str(uuid4()),
        event_key=f'push-test:{uuid4()}',
        recipient_user_id=user.user_id,
        category='push_test',
        title='서버 푸시 테스트',
        body='서버에서 전송한 테스트 알림입니다.',
        payload={
            'channel_id': channel_id,
            'scheduled_at': scheduled_at.isoformat() + 'Z',
            'expires_at': (scheduled_at + timedelta(seconds=payload.ttl_seconds)).isoformat() + 'Z',
            'delay_seconds': payload.delay_seconds,
            'ttl_seconds': payload.ttl_seconds,
            'title_en': 'Server push test',
            'body_en': 'This test notification was sent by the server.',
        },
        created_at=now,
    )
    database.add(event)
    database.flush()
    outbox = notificationOutbox(
        event_id=event.event_id,
        device_id=device.device_id,
        next_attempt_at=scheduled_at,
        created_at=now,
    )
    database.add(outbox)
    database.commit()
    logger.info(
        'Push test queued event_uuid=%s outbox_id=%s provider=%s channel_id=%s scheduled_at=%s',
        event.event_uuid,
        outbox.outbox_id,
        device.provider,
        channel_id,
        event.payload['scheduled_at'],
    )
    return {
        'queued': True,
        'installation_uuid': device.installation_uuid,
        'provider': device.provider,
        **push_test_output(event, outbox),
    }


def push_test_output(event: notificationEvent, outbox: notificationOutbox):
    return {
        'event_uuid': event.event_uuid,
        'outbox_id': outbox.outbox_id,
        'status': outbox.status,
        'channel_id': event.payload.get('channel_id', 'server-push'),
        'created_at': event.created_at.isoformat() + 'Z',
        'scheduled_at': event.payload.get('scheduled_at'),
        'expires_at': event.payload.get('expires_at'),
        'delay_seconds': event.payload.get('delay_seconds', 15),
        'ttl_seconds': event.payload.get('ttl_seconds'),
        'attempt_count': outbox.attempt_count,
        'provider_message_id': outbox.provider_message_id,
        'last_error': outbox.last_error,
    }


@router.get('/notifications/test/{event_uuid}')
def read_push_test(event_uuid: UUID, user: userDependency, database: databaseDependency):
    result = database.execute(
        select(notificationEvent, notificationOutbox)
        .join(notificationOutbox, notificationOutbox.event_id == notificationEvent.event_id)
        .where(
            notificationEvent.event_uuid == str(event_uuid),
            notificationEvent.recipient_user_id == user.user_id,
            notificationEvent.category == 'push_test',
        )
    ).first()
    if result is None:
        raise HTTPException(404, '테스트 알림을 찾을 수 없습니다.')
    return push_test_output(*result)
