from datetime import timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import case, func, select

from .database import (
    exerciseItem,
    exerciseResearchRecord,
    exerciseResearchRevision,
    sharedExerciseItem,
    userAccount,
)
from .mentorship_notifications import lock_research_coaching_accounts, notify_research_edit
from .schemas import exerciseResearchData, exerciseResearchInput, exerciseResearchListData
from .security import databaseDependency, userDependency, utc_now

router = APIRouter(prefix='/api/v1/exercises')
exercise_source_type = Literal['custom', 'shared']


def research_record_output(record, database=None):
    editor_id = getattr(record, 'updated_by_user_id', None)
    editor = database.get(userAccount, editor_id) if database is not None and editor_id else None
    return {
        'record_id': record.record_id,
        'content': record.content,
        'created_at': record.created_at.replace(tzinfo=timezone.utc).isoformat(),
        'revision': getattr(record, 'revision', 1),
        'updated_at': record.updated_at.replace(tzinfo=timezone.utc).isoformat()
        if getattr(record, 'updated_at', None) else None,
        'updated_by_name': (editor.display_name or '운동 사용자') if editor else None,
        'edited_by_mentor': bool(editor_id and editor_id != getattr(record, 'user_id', None)),
    }


def latest_research_by_exercise(database, user_id):
    exercise_source = case(
        (exerciseResearchRecord.shared_exercise_id.is_not(None), 'shared'), else_='custom'
    )
    exercise_id = func.coalesce(
        exerciseResearchRecord.exercise_id, exerciseResearchRecord.shared_exercise_id
    )
    ranked_records = select(
        exerciseResearchRecord.record_id,
        exerciseResearchRecord.content,
        exerciseResearchRecord.created_at,
        exerciseResearchRecord.user_id,
        exerciseResearchRecord.revision,
        exerciseResearchRecord.updated_at,
        exerciseResearchRecord.updated_by_user_id,
        exercise_source.label('exercise_source'),
        exercise_id.label('exercise_id'),
        func.row_number().over(
            partition_by=(exercise_source, exercise_id),
            order_by=(exerciseResearchRecord.created_at.desc(), exerciseResearchRecord.record_id.desc()),
        ).label('record_rank'),
    ).where(exerciseResearchRecord.user_id == user_id).subquery()
    return {
        (record.exercise_source, record.exercise_id): research_record_output(record, database)
        for record in database.execute(select(ranked_records).where(ranked_records.c.record_rank == 1))
    }


def require_exercise(database, user_id, exercise_source, exercise_id):
    if exercise_source == 'shared':
        exercise = database.get(sharedExerciseItem, exercise_id)
    else:
        exercise = database.scalar(select(exerciseItem).where(
            exerciseItem.exercise_id == exercise_id, exerciseItem.user_id == user_id,
        ))
    if exercise is None:
        raise HTTPException(404, '운동 종목을 찾을 수 없습니다.')


def research_record_query(user_id, exercise_source, exercise_id):
    exercise_column = (
        exerciseResearchRecord.shared_exercise_id
        if exercise_source == 'shared' else exerciseResearchRecord.exercise_id
    )
    return select(exerciseResearchRecord).where(
        exerciseResearchRecord.user_id == user_id, exercise_column == exercise_id,
    )


@router.get('/{exercise_source}/{exercise_id}/research-records', response_model=exerciseResearchListData)
def list_research_records(
    exercise_source: exercise_source_type,
    exercise_id: int,
    user: userDependency,
    database: databaseDependency,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
):
    require_exercise(database, user.user_id, exercise_source, exercise_id)
    records = database.scalars(
        research_record_query(user.user_id, exercise_source, exercise_id)
        .order_by(exerciseResearchRecord.created_at.desc(), exerciseResearchRecord.record_id.desc())
        .offset(offset).limit(limit + 1)
    ).all()
    return {
        'records': [research_record_output(record, database) for record in records[:limit]],
        'has_more': len(records) > limit,
    }


@router.post('/{exercise_source}/{exercise_id}/research-records', response_model=exerciseResearchData, status_code=201)
def create_research_record(
    exercise_source: exercise_source_type,
    exercise_id: int,
    payload: exerciseResearchInput,
    user: userDependency,
    database: databaseDependency,
):
    database.scalar(select(userAccount).where(
        userAccount.user_id == user.user_id,
    ).with_for_update())
    require_exercise(database, user.user_id, exercise_source, exercise_id)
    record = exerciseResearchRecord(
        user_id=user.user_id,
        exercise_id=exercise_id if exercise_source == 'custom' else None,
        shared_exercise_id=exercise_id if exercise_source == 'shared' else None,
        content=payload.content,
    )
    database.add(record)
    database.commit()
    return research_record_output(record, database)


def require_research_record(database, user_id, exercise_source, exercise_id, record_id):
    # Lock the owner before the note, matching account deletion and mentor edits.
    database.scalar(select(userAccount).where(userAccount.user_id == user_id).with_for_update())
    require_exercise(database, user_id, exercise_source, exercise_id)
    record = database.scalar(research_record_query(user_id, exercise_source, exercise_id).where(
        exerciseResearchRecord.record_id == record_id,
    ).with_for_update())
    if record is None:
        raise HTTPException(404, '연구 기록을 찾을 수 없습니다.')
    return record


def save_research_edit(database, record, editor_user_id, payload):
    if payload.expected_revision is not None and payload.expected_revision != record.revision:
        raise HTTPException(409, '다른 사용자가 연구 기록을 수정했습니다. 새로고침 후 다시 확인해 주세요.')
    if record.content == payload.content:
        return False
    now = utc_now()
    database.add(exerciseResearchRevision(
        record_id=record.record_id, revision=record.revision + 1,
        editor_user_id=editor_user_id, previous_content=record.content,
        content=payload.content, created_at=now,
    ))
    record.content = payload.content
    record.revision += 1
    record.updated_at = now
    record.updated_by_user_id = editor_user_id
    return True


def research_revision_output(database, record_id):
    revisions = database.execute(select(exerciseResearchRevision, userAccount.display_name).outerjoin(
        userAccount, userAccount.user_id == exerciseResearchRevision.editor_user_id,
    ).where(exerciseResearchRevision.record_id == record_id)
        .order_by(exerciseResearchRevision.revision.desc()).limit(20)).all()
    return [{
        'revision': revision.revision, 'editor_name': editor_name or '탈퇴한 사용자',
        'previous_content': revision.previous_content, 'content': revision.content,
        'created_at': revision.created_at.replace(tzinfo=timezone.utc).isoformat(),
    } for revision, editor_name in revisions]


@router.get('/{exercise_source}/{exercise_id}/research-records/{record_id}/revisions')
def read_research_revisions(
    exercise_source: exercise_source_type, exercise_id: int, record_id: int,
    user: userDependency, database: databaseDependency,
):
    record = require_research_record(database, user.user_id, exercise_source, exercise_id, record_id)
    return {'revisions': research_revision_output(database, record.record_id)}


@router.put('/{exercise_source}/{exercise_id}/research-records/{record_id}', response_model=exerciseResearchData)
def update_research_record(
    exercise_source: exercise_source_type,
    exercise_id: int,
    record_id: int,
    payload: exerciseResearchInput,
    user: userDependency,
    database: databaseDependency,
):
    relationship_uuid = lock_research_coaching_accounts(database, user.user_id)
    record = require_research_record(database, user.user_id, exercise_source, exercise_id, record_id)
    if save_research_edit(database, record, user.user_id, payload):
        notify_research_edit(database, record, user.user_id, relationship_uuid)
    database.commit()
    return research_record_output(record, database)


@router.delete('/{exercise_source}/{exercise_id}/research-records/{record_id}', status_code=204)
def delete_research_record(
    exercise_source: exercise_source_type,
    exercise_id: int,
    record_id: int,
    user: userDependency,
    database: databaseDependency,
):
    record = require_research_record(database, user.user_id, exercise_source, exercise_id, record_id)
    database.delete(record)
    database.commit()
    return Response(status_code=204)
