from datetime import date, timedelta, timezone
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import Field
from sqlalchemy import case, func, or_, select

from .coaching_routes import coachingMessageInput
from .community_policy import communityUserDependency
from .database import (
    exerciseItem,
    exerciseResearchRecord,
    mentorMessage,
    mentorRelationship,
    sharedExerciseItem,
    userAccount,
    userCredential,
)
from .exercise_research import research_record_output, research_revision_output, save_research_edit
from .mentorship_notifications import (
    coaching_notification_feed,
    mark_coaching_message_notifications_read,
    notify_coaching_message,
    notify_research_edit,
)
from .presentation import local_today
from .schemas import exerciseResearchInput, periodReportData, requestModel
from .security import databaseDependency, userDependency, utc_now
from .sharing import monday_of, period_report_output

router = APIRouter(prefix='/api/v1/mentorship')


@router.get('/notifications')
def read_coaching_notifications(
    user: userDependency, database: databaseDependency,
    after_id: int = Query(default=0, ge=0, le=9223372036854775807),
):
    return coaching_notification_feed(database, user.user_id, after_id)


class mentorRegistration(requestModel):
    mentor_uuid: UUID
    sharing_consent: Literal[True]


class mentorResearchEdit(exerciseResearchInput):
    expected_revision: int = Field(ge=1, strict=True)


class mentorReadInput(requestModel):
    message_id: int = Field(gt=0, strict=True)


def timestamp_output(value):
    return value.replace(tzinfo=timezone.utc).isoformat() if value else None


def relationship_scope(user_id):
    return select(mentorRelationship).where(or_(
        mentorRelationship.mentor_user_id == user_id,
        mentorRelationship.apprentice_user_id == user_id,
    ))


def require_relationship(database, relationship_uuid, user_id, *, lock=False):
    query = relationship_scope(user_id).where(
        mentorRelationship.relationship_uuid == str(relationship_uuid),
    ).execution_options(populate_existing=True)
    relationship = database.scalar(query.with_for_update() if lock else query)
    if relationship is None:
        raise HTTPException(404, '코치·회원 관계를 찾을 수 없습니다.')
    return relationship


def require_active_apprentice(database, relationship_uuid, mentor_user_id, *, lock=False):
    relationship = require_relationship(database, relationship_uuid, mentor_user_id, lock=lock)
    if relationship.mentor_user_id != mentor_user_id or relationship.ended_at is not None:
        raise HTTPException(403, '현재 연결된 코치만 회원의 기록을 확인할 수 있습니다.')
    apprentice = database.get(userAccount, relationship.apprentice_user_id)
    credential = database.get(userCredential, relationship.apprentice_user_id)
    if apprentice is None or credential is None or not credential.is_active:
        raise HTTPException(403, '현재 회원의 기록을 확인할 수 없습니다.')
    return relationship, apprentice


def relationship_outputs(database, relationships, user_id):
    if not relationships:
        return []
    relationship_ids = [item.relationship_id for item in relationships]
    counterpart_ids = {
        item.apprentice_user_id if item.mentor_user_id == user_id else item.mentor_user_id
        for item in relationships
    }
    counterparts = {account.user_id: (account, is_active) for account, is_active in database.execute(
        select(userAccount, userCredential.is_active).outerjoin(userCredential).where(
            userAccount.user_id.in_(counterpart_ids),
        ),
    )}
    latest_ids = select(func.max(mentorMessage.message_id)).where(
        mentorMessage.relationship_id.in_(relationship_ids),
    ).group_by(mentorMessage.relationship_id)
    latest_messages = {message.relationship_id: message for message in database.scalars(
        select(mentorMessage).where(mentorMessage.message_id.in_(latest_ids)),
    )}
    read_id = case(
        (mentorRelationship.mentor_user_id == user_id, mentorRelationship.mentor_read_message_id),
        else_=mentorRelationship.apprentice_read_message_id,
    )
    unread_counts = dict(database.execute(select(mentorMessage.relationship_id, func.count()).join(
        mentorRelationship, mentorRelationship.relationship_id == mentorMessage.relationship_id,
    ).where(
        mentorMessage.relationship_id.in_(relationship_ids), mentorMessage.sender_user_id != user_id,
        mentorMessage.message_id > read_id, mentorMessage.is_removed.is_(False),
    ).group_by(mentorMessage.relationship_id)).all())
    result = []
    for relationship in relationships:
        is_mentor = relationship.mentor_user_id == user_id
        counterpart_id = relationship.apprentice_user_id if is_mentor else relationship.mentor_user_id
        counterpart, is_active = counterparts[counterpart_id]
        latest = latest_messages.get(relationship.relationship_id)
        result.append({
            'relationship_uuid': relationship.relationship_uuid,
            'role': 'mentor' if is_mentor else 'apprentice',
            'counterpart_uuid': counterpart.user_uuid,
            'counterpart_name': counterpart.display_name or '운동 사용자',
            'counterpart_timezone': counterpart.timezone,
            'can_write': relationship.ended_at is None and bool(is_active),
            'created_at': timestamp_output(relationship.created_at),
            'ended_at': timestamp_output(relationship.ended_at),
            'unread_count': unread_counts.get(relationship.relationship_id, 0),
            'latest_message': latest.body[:100] if latest else None,
            'latest_message_at': timestamp_output(latest.created_at) if latest else None,
        })
    return result


def relationship_output(database, relationship, user_id):
    return relationship_outputs(database, [relationship], user_id)[0]


@router.get('')
def read_mentorship(user: communityUserDependency, database: databaseDependency):
    current_mentor = database.scalar(select(mentorRelationship).where(
        mentorRelationship.apprentice_user_id == user.user_id,
        mentorRelationship.ended_at.is_(None),
    ))
    read_id = case(
        (mentorRelationship.mentor_user_id == user.user_id, mentorRelationship.mentor_read_message_id),
        else_=mentorRelationship.apprentice_read_message_id,
    )
    unread_count = database.scalar(select(func.count()).select_from(mentorMessage).join(
        mentorRelationship, mentorRelationship.relationship_id == mentorMessage.relationship_id,
    ).where(
        or_(mentorRelationship.mentor_user_id == user.user_id,
            mentorRelationship.apprentice_user_id == user.user_id),
        mentorMessage.sender_user_id != user.user_id, mentorMessage.message_id > read_id,
        mentorMessage.is_removed.is_(False),
    ))
    return {
        'member_uuid': user.user_uuid,
        'mentor': relationship_output(database, current_mentor, user.user_id) if current_mentor else None,
        'apprentice_count': database.scalar(select(func.count()).select_from(mentorRelationship).where(
            mentorRelationship.mentor_user_id == user.user_id, mentorRelationship.ended_at.is_(None),
        )),
        'unread_count': unread_count,
    }


@router.post('/relationships', status_code=201)
def register_mentor(payload: mentorRegistration, user: communityUserDependency,
                    database: databaseDependency):
    mentor = database.scalar(select(userAccount).join(userCredential).where(
        userAccount.user_uuid == str(payload.mentor_uuid), userCredential.is_active.is_(True),
    ))
    if mentor is None:
        raise HTTPException(404, '해당 회원 ID의 코치를 찾을 수 없습니다.')
    if mentor.user_id == user.user_id:
        raise HTTPException(422, '자신을 코치로 등록할 수 없습니다.')
    # Same ordering as account deletion and messages; serialize registrations per apprentice.
    locked_accounts = database.scalars(select(userAccount).where(userAccount.user_id.in_(
        [user.user_id, mentor.user_id],
    )).order_by(userAccount.user_id).with_for_update()).all()
    mentor_active = database.scalar(select(userCredential.is_active).where(
        userCredential.user_id == mentor.user_id,
    ))
    if len(locked_accounts) != 2 or not mentor_active:
        raise HTTPException(404, '해당 회원 ID의 코치를 찾을 수 없습니다.')
    existing = database.scalar(select(mentorRelationship).where(
        mentorRelationship.apprentice_user_id == user.user_id,
        mentorRelationship.ended_at.is_(None),
    ))
    if existing:
        if existing.mentor_user_id == mentor.user_id:
            return relationship_output(database, existing, user.user_id)
        raise HTTPException(409, '기존 코치와의 관계를 해제한 후 새 코치를 등록해 주세요.')
    recent_count = database.scalar(select(func.count()).select_from(mentorRelationship).where(
        mentorRelationship.apprentice_user_id == user.user_id,
        mentorRelationship.created_at >= utc_now() - timedelta(days=1),
    ))
    if recent_count >= 10:
        raise HTTPException(429, '오늘 코치 등록 가능 횟수를 초과했습니다.')
    relationship = mentorRelationship(
        relationship_uuid=str(uuid4()), mentor_user_id=mentor.user_id,
        apprentice_user_id=user.user_id, created_at=utc_now(),
    )
    database.add(relationship)
    database.commit()
    return relationship_output(database, relationship, user.user_id)


@router.get('/relationships')
def list_relationships(
    user: communityUserDependency, database: databaseDependency,
    role: Literal['mentor', 'apprentice'] = 'mentor',
    status: Literal['active', 'ended'] = 'active',
    before_id: int | None = Query(default=None, gt=0),
):
    role_column = (mentorRelationship.mentor_user_id if role == 'mentor'
                   else mentorRelationship.apprentice_user_id)
    query = select(mentorRelationship).where(
        role_column == user.user_id,
        mentorRelationship.ended_at.is_(None) if status == 'active'
        else mentorRelationship.ended_at.is_not(None),
    )
    if before_id is not None:
        query = query.where(mentorRelationship.relationship_id < before_id)
    relationships = database.scalars(query.order_by(
        mentorRelationship.relationship_id.desc(),
    ).limit(21)).all()
    return {
        'relationships': relationship_outputs(database, relationships[:20], user.user_id),
        'next_cursor': relationships[19].relationship_id if len(relationships) > 20 else None,
    }


@router.get('/relationships/{relationship_uuid}')
def read_relationship(relationship_uuid: UUID, user: communityUserDependency,
                      database: databaseDependency):
    return relationship_output(database, require_relationship(
        database, relationship_uuid, user.user_id,
    ), user.user_id)


@router.delete('/relationships/{relationship_uuid}')
def end_relationship(relationship_uuid: UUID, user: communityUserDependency,
                     database: databaseDependency):
    relationship = require_relationship(database, relationship_uuid, user.user_id, lock=True)
    if relationship.ended_at is None:
        relationship.ended_at = utc_now()
        database.commit()
    return {'ended': True}


def message_output(message, user_id):
    return {
        'message_id': message.message_id, 'body': message.body,
        'is_mine': message.sender_user_id == user_id, 'is_removed': message.is_removed,
        'created_at': timestamp_output(message.created_at),
    }


@router.get('/relationships/{relationship_uuid}/messages')
def list_messages(
    relationship_uuid: UUID, user: communityUserDependency, database: databaseDependency,
    before_id: int | None = Query(default=None, gt=0),
):
    relationship = require_relationship(database, relationship_uuid, user.user_id)
    query = select(mentorMessage).where(mentorMessage.relationship_id == relationship.relationship_id)
    if before_id is not None:
        query = query.where(mentorMessage.message_id < before_id)
    messages = database.scalars(query.order_by(mentorMessage.message_id.desc()).limit(41)).all()
    return {
        'messages': [message_output(message, user.user_id) for message in reversed(messages[:40])],
        'next_cursor': messages[39].message_id if len(messages) > 40 else None,
    }


@router.post('/relationships/{relationship_uuid}/messages', status_code=201)
def send_message(relationship_uuid: UUID, payload: coachingMessageInput,
                 user: communityUserDependency, database: databaseDependency):
    relationship = require_relationship(database, relationship_uuid, user.user_id)
    database.scalars(select(userAccount).where(userAccount.user_id.in_(
        [relationship.mentor_user_id, relationship.apprentice_user_id],
    )).order_by(userAccount.user_id).with_for_update()).all()
    relationship = require_relationship(database, relationship_uuid, user.user_id, lock=True)
    if relationship.ended_at is not None:
        raise HTTPException(403, '해제된 관계에서는 메시지를 보낼 수 없습니다.')
    counterpart_id = (relationship.apprentice_user_id if relationship.mentor_user_id == user.user_id
                      else relationship.mentor_user_id)
    credential = database.get(userCredential, counterpart_id)
    if credential is None or not credential.is_active:
        raise HTTPException(403, '현재 상대방에게 메시지를 보낼 수 없습니다.')
    existing = database.scalar(select(mentorMessage).where(
        mentorMessage.relationship_id == relationship.relationship_id,
        mentorMessage.sender_user_id == user.user_id, mentorMessage.request_id == str(payload.request_id),
    ))
    if existing:
        return message_output(existing, user.user_id)
    recent_count = database.scalar(select(func.count()).select_from(mentorMessage).where(
        mentorMessage.sender_user_id == user.user_id,
        mentorMessage.created_at >= utc_now() - timedelta(hours=1),
    ))
    if recent_count >= 100:
        raise HTTPException(429, '메시지가 너무 많습니다. 잠시 후 다시 보내 주세요.')
    message = mentorMessage(
        relationship_id=relationship.relationship_id, sender_user_id=user.user_id,
        request_id=str(payload.request_id), body=payload.body, created_at=utc_now(),
    )
    database.add(message)
    database.flush()
    notify_coaching_message(database, relationship, message)
    database.commit()
    return message_output(message, user.user_id)


@router.post('/relationships/{relationship_uuid}/read')
def mark_messages_read(relationship_uuid: UUID, payload: mentorReadInput,
                       user: communityUserDependency, database: databaseDependency):
    relationship = require_relationship(database, relationship_uuid, user.user_id, lock=True)
    message = database.scalar(select(mentorMessage).where(
        mentorMessage.relationship_id == relationship.relationship_id,
        mentorMessage.message_id == payload.message_id,
    ))
    if message is None:
        raise HTTPException(404, '메시지를 찾을 수 없습니다.')
    column_name = ('mentor_read_message_id' if relationship.mentor_user_id == user.user_id
                   else 'apprentice_read_message_id')
    setattr(relationship, column_name, max(getattr(relationship, column_name), message.message_id))
    mark_coaching_message_notifications_read(database, relationship, user.user_id, message.message_id)
    database.commit()
    return {'read': True}


@router.get('/relationships/{relationship_uuid}/research-records')
def list_apprentice_research(
    relationship_uuid: UUID, user: communityUserDependency, database: databaseDependency,
    before_id: int | None = Query(default=None, gt=0),
):
    _, apprentice = require_active_apprentice(database, relationship_uuid, user.user_id)
    query = select(exerciseResearchRecord, func.coalesce(
        exerciseItem.name, sharedExerciseItem.name,
    )).outerjoin(exerciseItem, exerciseItem.exercise_id == exerciseResearchRecord.exercise_id).outerjoin(
        sharedExerciseItem, sharedExerciseItem.exercise_id == exerciseResearchRecord.shared_exercise_id,
    ).where(exerciseResearchRecord.user_id == apprentice.user_id)
    if before_id is not None:
        query = query.where(exerciseResearchRecord.record_id < before_id)
    records = database.execute(query.order_by(exerciseResearchRecord.record_id.desc()).limit(21)).all()
    return {
        'records': [{**research_record_output(record, database), 'exercise_name': name,
                     'exercise_source': 'shared' if record.shared_exercise_id is not None else 'custom'}
                    for record, name in records[:20]],
        'next_cursor': records[19][0].record_id if len(records) > 20 else None,
    }


def require_apprentice_record(database, relationship_uuid, user_id, record_id, *, lock=False):
    if lock:
        relationship = require_relationship(database, relationship_uuid, user_id)
        database.scalars(select(userAccount).where(userAccount.user_id.in_(
            [relationship.mentor_user_id, relationship.apprentice_user_id],
        )).order_by(userAccount.user_id).with_for_update()).all()
    _, apprentice = require_active_apprentice(database, relationship_uuid, user_id, lock=lock)
    query = select(exerciseResearchRecord).where(
        exerciseResearchRecord.record_id == record_id, exerciseResearchRecord.user_id == apprentice.user_id,
    )
    record = database.scalar(query.with_for_update() if lock else query)
    if record is None:
        raise HTTPException(404, '연구 기록을 찾을 수 없습니다.')
    return record


@router.put('/relationships/{relationship_uuid}/research-records/{record_id}')
def edit_apprentice_research(
    relationship_uuid: UUID, record_id: int, payload: mentorResearchEdit,
    user: communityUserDependency, database: databaseDependency,
):
    record = require_apprentice_record(database, relationship_uuid, user.user_id, record_id, lock=True)
    if save_research_edit(database, record, user.user_id, payload):
        notify_research_edit(database, record, user.user_id, str(relationship_uuid))
    database.commit()
    return research_record_output(record, database)


@router.get('/relationships/{relationship_uuid}/research-records/{record_id}/revisions')
def read_apprentice_revisions(
    relationship_uuid: UUID, record_id: int, user: communityUserDependency, database: databaseDependency,
):
    record = require_apprentice_record(database, relationship_uuid, user.user_id, record_id)
    return {'revisions': research_revision_output(database, record.record_id)}


@router.get('/relationships/{relationship_uuid}/report', response_model=periodReportData)
def read_apprentice_report(
    relationship_uuid: UUID, user: communityUserDependency, database: databaseDependency,
    period_type: Literal['weekly', 'monthly'] = 'weekly', start_date: date | None = None,
):
    _, apprentice = require_active_apprentice(database, relationship_uuid, user.user_id)
    today = local_today(apprentice.timezone)
    selected_date = start_date or today
    period_start = monday_of(selected_date) if period_type == 'weekly' else selected_date.replace(day=1)
    if period_start > today or selected_date.year < 2000:
        raise HTTPException(422, '조회할 수 없는 리포트 기간입니다.')
    return period_report_output(database, apprentice.user_id, today, period_type, selected_date)
