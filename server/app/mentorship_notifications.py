from uuid import uuid4

from sqlalchemy import case, func, or_, select, update

from .database import (
    exerciseItem,
    mentorRelationship,
    notificationEvent,
    notificationInbox,
    sharedExerciseItem,
    userAccount,
    userCredential,
)
from .security import utc_now

coaching_notification_categories = ('mentor_message', 'mentor_research_edit')


def lock_research_coaching_accounts(database, owner_user_id):
    relationship = database.scalar(select(mentorRelationship).where(
        mentorRelationship.apprentice_user_id == owner_user_id,
        mentorRelationship.ended_at.is_(None),
    ))
    user_ids = {owner_user_id}
    if relationship:
        user_ids.add(relationship.mentor_user_id)
    # Serialize event creation per recipient before locking notes, as messages do.
    # This also keeps the notification cursor safe across concurrent commits.
    database.scalars(select(userAccount).where(userAccount.user_id.in_(user_ids))
                     .order_by(userAccount.user_id).with_for_update()).all()
    return relationship.relationship_uuid if relationship else None


def create_coaching_notification(database, relationship, sender_user_id, category, event_key, payload):
    recipient_user_id = (relationship.apprentice_user_id
                         if sender_user_id == relationship.mentor_user_id
                         else relationship.mentor_user_id)
    is_active = database.scalar(select(userCredential.is_active).where(
        userCredential.user_id == recipient_user_id,
    ))
    if not is_active or relationship.ended_at is not None:
        return
    event = notificationEvent(
        event_uuid=str(uuid4()), event_key=event_key, recipient_user_id=recipient_user_id,
        sender_user_id=sender_user_id, category=category,
        title='새 코칭 메시지' if category == 'mentor_message' else '연구일지 수정 알림',
        body=('코칭 대화에 새 메시지가 도착했습니다.' if category == 'mentor_message'
              else '코칭 연구일지가 수정되었습니다. 변경 내용을 확인해 주세요.'),
        payload={'relationship_uuid': relationship.relationship_uuid, **payload},
        created_at=utc_now(),
    )
    database.add(event)
    database.flush()
    database.add(notificationInbox(event_id=event.event_id, user_id=recipient_user_id))
    # Intentionally no push outbox: devices register these as local notifications.


def notify_coaching_message(database, relationship, message):
    create_coaching_notification(
        database, relationship, message.sender_user_id, 'mentor_message',
        f'mentor-message:{message.message_id}',
        {'target': 'messages', 'message_id': message.message_id},
    )


def notify_research_edit(database, record, editor_user_id, relationship_uuid):
    if relationship_uuid is None:
        return
    relationship = database.scalar(select(mentorRelationship).where(
        mentorRelationship.relationship_uuid == relationship_uuid,
        mentorRelationship.apprentice_user_id == record.user_id,
        mentorRelationship.ended_at.is_(None),
    ).execution_options(populate_existing=True))
    if relationship is None or editor_user_id not in {
        relationship.mentor_user_id, relationship.apprentice_user_id,
    }:
        return
    exercise_source = 'shared' if record.shared_exercise_id is not None else 'custom'
    exercise_id = record.shared_exercise_id if exercise_source == 'shared' else record.exercise_id
    exercise = database.get(sharedExerciseItem if exercise_source == 'shared' else exerciseItem, exercise_id)
    create_coaching_notification(
        database, relationship, editor_user_id, 'mentor_research_edit',
        f'mentor-research:{record.record_id}:{record.revision}',
        {'target': 'research' if editor_user_id == record.user_id else 'own_research',
         'record_id': record.record_id, 'revision': record.revision,
         'exercise_source': exercise_source, 'exercise_id': exercise_id,
         'exercise_name': exercise.name if exercise else '연구일지'},
    )


def mark_coaching_message_notifications_read(database, relationship, user_id, message_id):
    event_ids = select(notificationEvent.event_id).where(
        notificationEvent.recipient_user_id == user_id,
        notificationEvent.category == 'mentor_message',
        notificationEvent.payload['relationship_uuid'].as_string() == relationship.relationship_uuid,
        notificationEvent.payload['message_id'].as_integer() <= message_id,
    )
    database.execute(update(notificationInbox).where(
        notificationInbox.user_id == user_id, notificationInbox.read_at.is_(None),
        notificationInbox.event_id.in_(event_ids),
    ).values(read_at=utc_now()))


def active_coaching_relationship_uuids(user_id):
    counterpart_id = case(
        (mentorRelationship.mentor_user_id == user_id, mentorRelationship.apprentice_user_id),
        else_=mentorRelationship.mentor_user_id,
    )
    return select(mentorRelationship.relationship_uuid).join(
        userCredential, userCredential.user_id == counterpart_id,
    ).where(
        or_(mentorRelationship.mentor_user_id == user_id,
            mentorRelationship.apprentice_user_id == user_id),
        mentorRelationship.ended_at.is_(None), userCredential.is_active.is_(True),
    )


def coaching_notification_feed(database, user_id, after_id):
    active_uuids = list(database.scalars(active_coaching_relationship_uuids(user_id)))
    latest_cursor = database.scalar(select(func.max(notificationEvent.event_id)).where(
        notificationEvent.recipient_user_id == user_id,
        notificationEvent.category.in_(coaching_notification_categories),
    )) or 0
    events = database.scalars(select(notificationEvent).join(
        notificationInbox, notificationInbox.event_id == notificationEvent.event_id,
    ).where(
        notificationEvent.recipient_user_id == user_id, notificationInbox.user_id == user_id,
        notificationInbox.read_at.is_(None), notificationEvent.event_id > after_id,
        notificationEvent.event_id <= latest_cursor,
        notificationEvent.category.in_(coaching_notification_categories),
        notificationEvent.payload['relationship_uuid'].as_string().in_(active_uuids),
    ).order_by(notificationEvent.event_id).limit(51)).all()
    page = events[:50]
    return {
        'notifications': [{
            'event_id': event.event_id, 'notification_uuid': event.event_uuid,
            'category': event.category, 'title': event.title, 'body': event.body,
            'created_at': event.created_at.isoformat() + 'Z', **event.payload,
        } for event in page],
        'cursor': page[-1].event_id if len(events) > 50 else latest_cursor,
        'has_more': len(events) > 50,
        'active_relationship_uuids': active_uuids,
    }
