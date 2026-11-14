from sqlalchemy import and_, func, or_, select

from .database import challengeRoom, challengeRound, notificationEvent, notificationInbox
from .mentorship_notifications import (
    active_coaching_relationship_uuids,
    coaching_notification_categories,
)


def notification_inbox_output(database, user_id, limit, before_id, scope):
    coaching_scope = notificationEvent.category.in_(coaching_notification_categories)
    visible_scope = notificationEvent.category.not_in(coaching_notification_categories)
    if scope == 'all':
        visible_scope = or_(visible_scope, and_(
            coaching_scope,
            notificationEvent.payload['relationship_uuid'].as_string().in_(
                active_coaching_relationship_uuids(user_id),
            ),
        ))
    query = (
        select(notificationEvent, notificationInbox)
        .join(notificationInbox, notificationInbox.event_id == notificationEvent.event_id)
        .outerjoin(challengeRound, challengeRound.round_id == notificationEvent.round_id)
        .outerjoin(challengeRoom, challengeRoom.room_id == challengeRound.room_id)
        .where(
            notificationInbox.user_id == user_id,
            notificationEvent.recipient_user_id == user_id,
            visible_scope,
            or_(notificationEvent.round_id.is_(None), challengeRoom.status != 'cancelled'),
        )
    )
    unread_count = database.scalar(select(func.count()).select_from(
        query.where(notificationInbox.read_at.is_(None)).subquery(),
    ))
    if before_id is not None:
        query = query.where(notificationEvent.event_id < before_id)
    rows = database.execute(query.order_by(notificationEvent.event_id.desc()).limit(limit + 1)).all()
    return {
        'notifications': [{
            **event.payload,
            'notification_uuid': event.event_uuid,
            'category': event.category,
            'title': event.title,
            'body': event.body,
            'created_at': event.created_at.isoformat() + 'Z',
            'read_at': inbox.read_at.isoformat() + 'Z' if inbox.read_at else None,
        } for event, inbox in rows[:limit]],
        'unread_count': unread_count,
        'next_cursor': rows[limit - 1][0].event_id if len(rows) > limit else None,
    }
