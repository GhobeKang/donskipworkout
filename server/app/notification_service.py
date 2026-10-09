from datetime import datetime, time, timedelta
from hashlib import sha256
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import select

from .database import (
    challengeRoundMember,
    notificationEvent,
    notificationInbox,
    notificationOutbox,
    notificationPreference,
    pushDevice,
    userAccount,
)


def next_allowed_send_at(
    now: datetime,
    preference: notificationPreference | None,
    fallback_timezone: str = 'Asia/Seoul',
) -> datetime:
    preference_timezone = ZoneInfo(preference.timezone if preference else fallback_timezone)
    local_now = now.replace(tzinfo=ZoneInfo('UTC')).astimezone(preference_timezone)
    quiet_start = preference.quiet_start if preference else time(21, 0)
    quiet_end = preference.quiet_end if preference else time(9, 0)
    local_time = local_now.timetz().replace(tzinfo=None)
    if quiet_start == quiet_end:
        return now
    is_quiet = (
        quiet_start <= local_time < quiet_end
        if quiet_start < quiet_end
        else local_time >= quiet_start or local_time < quiet_end
    )
    if not is_quiet:
        return now
    next_date = (
        local_now.date() + timedelta(days=1)
        if quiet_start > quiet_end and local_time >= quiet_start
        else local_now.date()
    )
    next_local = datetime.combine(next_date, quiet_end, preference_timezone)
    return next_local.astimezone(ZoneInfo('UTC')).replace(tzinfo=None)


def create_room_news_events(
    database,
    current_round,
    room,
    sender_user_id: int,
    rulebook_version: int,
    now: datetime,
):
    recipients = database.scalars(
        select(challengeRoundMember).where(
            challengeRoundMember.round_id == current_round.round_id,
            challengeRoundMember.user_id != sender_user_id,
            challengeRoundMember.participant_status.not_in(['withdrawn', 'removed']),
        )
    ).all()
    created_count = 0
    queued_count = 0
    for member in recipients:
        event_key = f'rulebook:{current_round.round_uuid}:{rulebook_version}:{member.user_id}'
        if database.scalar(
            select(notificationEvent.event_id).where(notificationEvent.event_key == event_key)
        ):
            continue
        event = notificationEvent(
            event_uuid=str(uuid4()),
            event_key=event_key,
            round_id=current_round.round_id,
            recipient_user_id=member.user_id,
            sender_user_id=sender_user_id,
            category='rulebook_published',
            title='룰북이 게시되었습니다',
            body='참여 중인 챌린지의 룰북을 확인하고 동의해 주세요.',
            payload={
                'round_uuid': current_round.round_uuid,
                'room_uuid': room.room_uuid,
                'rulebook_version': rulebook_version,
                'event_type': 'rulebook_published',
            },
            created_at=now,
        )
        database.add(event)
        database.flush()
        database.add(notificationInbox(event_id=event.event_id, user_id=member.user_id))
        preference = database.scalar(
            select(notificationPreference).where(
                notificationPreference.round_id == current_round.round_id,
                notificationPreference.user_id == member.user_id,
            )
        )
        account = database.get(userAccount, member.user_id)
        next_attempt_at = next_allowed_send_at(
            now, preference, account.timezone if account else 'Asia/Seoul'
        )
        devices = database.scalars(
            select(pushDevice).where(
                pushDevice.user_id == member.user_id,
                pushDevice.active.is_(True),
            )
        ).all()
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
        queued_count += len(devices)
        created_count += 1
    return {'inbox_count': created_count, 'push_queued_count': queued_count}


def device_token_hash(token: str) -> str:
    return sha256(token.encode('utf-8')).hexdigest()
