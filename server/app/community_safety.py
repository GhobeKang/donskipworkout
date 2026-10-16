from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import or_, select, update

from .database import (
    challengeRound,
    challengeRoundMember,
    notificationEvent,
    notificationOutbox,
    userAccount,
    userBlock,
)
from .security import utc_now


def blocked_user_ids(database, user_id):
    rows = database.execute(select(userBlock).where(or_(
        userBlock.blocker_user_id == user_id, userBlock.blocked_user_id == user_id,
    ))).scalars()
    return {
        row.blocked_user_id if row.blocker_user_id == user_id else row.blocker_user_id
        for row in rows
    }


def users_are_blocked(database, first_user_id, second_user_id):
    if first_user_id is None or second_user_id is None:
        return False
    return database.get(userBlock, (first_user_id, second_user_id)) is not None or database.get(
        userBlock, (second_user_id, first_user_id)
    ) is not None


def require_interaction_allowed(database, first_user_id, second_user_id):
    if second_user_id is None:
        raise HTTPException(409, '방장이 없는 챌린지에서는 대화를 시작할 수 없습니다.')
    if users_are_blocked(database, first_user_id, second_user_id):
        raise HTTPException(403, '차단 관계에서는 대화하거나 직접 알림을 보낼 수 없습니다.')


def require_shared_user(database, user_id, target_uuid):
    target = database.scalar(select(userAccount).where(userAccount.user_uuid == str(target_uuid)))
    if target is None or target.user_id == user_id:
        raise HTTPException(404, '신고·차단할 사용자를 찾을 수 없습니다.')
    user_rounds = select(challengeRoundMember.round_id).where(
        challengeRoundMember.user_id == user_id,
    )
    shared_membership = database.scalar(select(challengeRoundMember.member_id).where(
        challengeRoundMember.user_id == target.user_id,
        challengeRoundMember.round_id.in_(user_rounds),
    ).limit(1))
    if shared_membership is None:
        raise HTTPException(404, '함께 참여한 챌린지의 사용자만 신고·차단할 수 있습니다.')
    return target


def cancel_direct_notifications(database, first_user_id, second_user_id):
    event_ids = select(notificationEvent.event_id).where(or_(
        (notificationEvent.sender_user_id == first_user_id)
        & (notificationEvent.recipient_user_id == second_user_id),
        (notificationEvent.sender_user_id == second_user_id)
        & (notificationEvent.recipient_user_id == first_user_id),
    ))
    database.execute(update(notificationOutbox).where(
        notificationOutbox.event_id.in_(event_ids),
        notificationOutbox.status.in_(['queued', 'processing']),
    ).values(status='cancelled', last_error='user_blocked'))


def filter_blocked_members(database, user_id, payload):
    blocked_ids = blocked_user_ids(database, user_id)
    if not blocked_ids:
        return payload
    blocked_uuids = set(database.scalars(select(userAccount.user_uuid).where(
        userAccount.user_id.in_(blocked_ids),
    )))

    def filter_value(value):
        if isinstance(value, list):
            return [filter_value(item) for item in value if not (
                isinstance(item, dict)
                and (item.get('user_id') in blocked_ids or item.get('user_uuid') in blocked_uuids)
            )]
        if isinstance(value, dict):
            return {key: filter_value(item) for key, item in value.items()}
        return value

    return filter_value(payload)


def require_room_visible(database, user_id, room):
    if room.status == 'cancelled' or users_are_blocked(database, user_id, room.host_user_id):
        raise HTTPException(404, '방을 찾을 수 없습니다.')


def hide_room(database, room):
    room.status = 'cancelled'
    room.name = '운영 정책에 따라 숨긴 챌린지'
    room.description = None
    round_ids = select(challengeRound.round_id).where(challengeRound.room_id == room.room_id)
    event_ids = select(notificationEvent.event_id).where(notificationEvent.round_id.in_(round_ids))
    database.execute(update(notificationOutbox).where(
        notificationOutbox.event_id.in_(event_ids),
        notificationOutbox.status.in_(['queued', 'processing']),
    ).values(status='cancelled', last_error='content_removed'))


def report_window_start():
    return utc_now() - timedelta(days=1)
