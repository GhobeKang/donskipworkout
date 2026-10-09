from datetime import datetime, time, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, or_, select

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
from .schemas import challengeNudgeRequest, notificationPreferenceUpdate, pushDeviceRegistration
from .security import databaseDependency, userDependency, utc_now

router = APIRouter(prefix='/api/v1')


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
    rows = database.execute(
        select(notificationEvent, notificationInbox)
        .join(notificationInbox, notificationInbox.event_id == notificationEvent.event_id)
        .outerjoin(challengeRound, challengeRound.round_id == notificationEvent.round_id)
        .outerjoin(challengeRoom, challengeRoom.room_id == challengeRound.room_id)
        .where(
            notificationInbox.user_id == user.user_id,
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
        target_device.active = True
        target_device.updated_at = utc_now()
    database.commit()
    return {'registered': True, 'platform': payload.platform}


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
        accepted_count = database.scalar(
            select(func.count(challengeCheckin.checkin_id)).where(
                challengeCheckin.period_id == active_period.period_id,
                challengeCheckin.user_id == member.user_id,
                challengeCheckin.status == 'accepted',
            )
        ) or 0
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
            select(notificationEvent).where(
                notificationEvent.round_id == current_round.round_id,
                notificationEvent.recipient_user_id == member.user_id,
                notificationEvent.sender_user_id == user.user_id,
                notificationEvent.category == 'host_nudge',
                notificationEvent.created_at >= day_start_utc,
            ).order_by(notificationEvent.created_at.desc())
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
