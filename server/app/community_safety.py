from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select, update

from .database import (
    challengeRound,
    challengeRoundMember,
    notificationEvent,
    notificationOutbox,
    userAccount,
)
from .security import utc_now


def require_host_available(host_user_id):
    if host_user_id is None:
        raise HTTPException(409, '방장이 없는 챌린지에서는 대화를 시작할 수 없습니다.')


def require_shared_user(database, user_id, target_uuid):
    target = database.scalar(select(userAccount).where(userAccount.user_uuid == str(target_uuid)))
    if target is None or target.user_id == user_id:
        raise HTTPException(404, '신고할 사용자를 찾을 수 없습니다.')
    user_rounds = select(challengeRoundMember.round_id).where(
        challengeRoundMember.user_id == user_id,
    )
    shared_membership = database.scalar(select(challengeRoundMember.member_id).where(
        challengeRoundMember.user_id == target.user_id,
        challengeRoundMember.round_id.in_(user_rounds),
    ).limit(1))
    if shared_membership is None:
        raise HTTPException(404, '함께 참여한 챌린지의 사용자만 신고할 수 있습니다.')
    return target


def require_room_visible(room):
    if room.status == 'cancelled':
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
