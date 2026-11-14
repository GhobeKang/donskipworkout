from datetime import timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import case, func, select

from .database import exerciseItem, exerciseResearchRecord, sharedExerciseItem
from .schemas import exerciseResearchData, exerciseResearchInput, exerciseResearchListData
from .security import databaseDependency, userDependency

router = APIRouter(prefix='/api/v1/exercises')
exercise_source_type = Literal['custom', 'shared']


def research_record_output(record):
    return {
        'record_id': record.record_id,
        'content': record.content,
        'created_at': record.created_at.replace(tzinfo=timezone.utc).isoformat(),
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
        exercise_source.label('exercise_source'),
        exercise_id.label('exercise_id'),
        func.row_number().over(
            partition_by=(exercise_source, exercise_id),
            order_by=(exerciseResearchRecord.created_at.desc(), exerciseResearchRecord.record_id.desc()),
        ).label('record_rank'),
    ).where(exerciseResearchRecord.user_id == user_id).subquery()
    return {
        (record.exercise_source, record.exercise_id): research_record_output(record)
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
        'records': [research_record_output(record) for record in records[:limit]],
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
    require_exercise(database, user.user_id, exercise_source, exercise_id)
    record = exerciseResearchRecord(
        user_id=user.user_id,
        exercise_id=exercise_id if exercise_source == 'custom' else None,
        shared_exercise_id=exercise_id if exercise_source == 'shared' else None,
        content=payload.content,
    )
    database.add(record)
    database.commit()
    return research_record_output(record)


def require_research_record(database, user_id, exercise_source, exercise_id, record_id):
    require_exercise(database, user_id, exercise_source, exercise_id)
    record = database.scalar(research_record_query(user_id, exercise_source, exercise_id).where(
        exerciseResearchRecord.record_id == record_id,
    ))
    if record is None:
        raise HTTPException(404, '연구 기록을 찾을 수 없습니다.')
    return record


@router.put('/{exercise_source}/{exercise_id}/research-records/{record_id}', response_model=exerciseResearchData)
def update_research_record(
    exercise_source: exercise_source_type,
    exercise_id: int,
    record_id: int,
    payload: exerciseResearchInput,
    user: userDependency,
    database: databaseDependency,
):
    record = require_research_record(database, user.user_id, exercise_source, exercise_id, record_id)
    record.content = payload.content
    database.commit()
    return research_record_output(record)


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
