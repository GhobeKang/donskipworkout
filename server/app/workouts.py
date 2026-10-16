from datetime import date

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import case, delete, func, select
from sqlalchemy.exc import IntegrityError

from .database import (
    exercise_report_area,
    exerciseItem,
    sharedExerciseItem,
    userAccount,
    userSharedExerciseProgress,
    workoutSession,
    workoutSet,
)
from .schemas import (
    areaWorkoutImportData,
    exercise_target_area,
    exerciseData,
    exerciseGroupInput,
    exerciseInput,
)
from .security import databaseDependency, userDependency

router = APIRouter(prefix='/api/v1')


@router.get('/sessions/by-date/{workout_date}/area-import', response_model=areaWorkoutImportData)
def read_area_workout_import(
    workout_date: date,
    target_area: exercise_target_area,
    user: userDependency,
    database: databaseDependency,
):
    custom_exercise_join = (
        (workoutSet.exercise_source == 'custom')
        & (exerciseItem.exercise_id == workoutSet.exercise_id)
        & (exerciseItem.user_id == user.user_id)
    )
    shared_exercise_join = (workoutSet.exercise_source == 'shared') & (
        sharedExerciseItem.exercise_id == workoutSet.shared_exercise_id
    )
    matching_area = func.coalesce(sharedExerciseItem.target_area, exerciseItem.target_area)
    matching_sets = (
        select(workoutSet.set_id)
        .outerjoin(exerciseItem, custom_exercise_join)
        .outerjoin(sharedExerciseItem, shared_exercise_join)
        .where(
            workoutSet.session_id == workoutSession.session_id,
            matching_area == target_area,
        )
        .exists()
    )
    # Limit sessions before fetching sets; multiple sets still count as one appearance.
    recent_sessions = (
        select(workoutSession.session_id, workoutSession.workout_date)
        .where(
            workoutSession.user_id == user.user_id,
            workoutSession.workout_date < workout_date,
            matching_sets,
        )
        .order_by(workoutSession.workout_date.desc())
        .limit(3)
        .subquery('recent_area_sessions')
    )
    referenced_exercise_id = case(
        (workoutSet.exercise_source == 'shared', workoutSet.shared_exercise_id),
        else_=workoutSet.exercise_id,
    )
    rows = database.execute(
        select(
            workoutSet.session_id,
            recent_sessions.c.workout_date,
            workoutSet.exercise_source,
            referenced_exercise_id.label('exercise_id'),
            func.coalesce(sharedExerciseItem.name, exerciseItem.name).label('exercise_name'),
            workoutSet.weight_kg,
            workoutSet.reps,
        )
        .join(recent_sessions, recent_sessions.c.session_id == workoutSet.session_id)
        .outerjoin(exerciseItem, custom_exercise_join)
        .outerjoin(sharedExerciseItem, shared_exercise_join)
        .where(matching_area == target_area)
        .order_by(
            recent_sessions.c.workout_date.desc(),
            workoutSet.exercise_order,
            workoutSet.exercise_source,
            referenced_exercise_id,
            workoutSet.set_order,
        )
    )
    session_ids = set()
    sessions_by_exercise = {}
    latest_groups = {}
    for row in rows:
        session_ids.add(row.session_id)
        exercise_key = (row.exercise_source, row.exercise_id)
        sessions_by_exercise.setdefault(exercise_key, set()).add(row.session_id)
        group = latest_groups.setdefault(
            exercise_key,
            {
                'exercise_source': row.exercise_source,
                'exercise_id': row.exercise_id,
                'exercise_name': row.exercise_name,
                'target_area': target_area,
                'source_workout_date': row.workout_date.isoformat(),
                'sets': [],
            },
        )
        if group['source_workout_date'] == row.workout_date.isoformat():
            group['sets'].append({'weight_kg': float(row.weight_kg), 'reps': row.reps})
    return {
        'workout_date': workout_date.isoformat(),
        'target_area': target_area,
        'session_count': len(session_ids),
        'exercise_groups': [
            {**group, 'session_count': len(sessions_by_exercise[exercise_key])}
            for exercise_key, group in latest_groups.items()
            if len(sessions_by_exercise[exercise_key]) >= 2
        ],
    }


@router.get('/exercise-progress')
def exercise_progress(user: userDependency, database: databaseDependency):
    # Stable IDs keep renamed exercises together; deleted IDs are no longer available.
    exercise_name = func.coalesce(
        sharedExerciseItem.name, exerciseItem.name, workoutSet.exercise_name
    )
    target_area = exercise_report_area()
    archived_name = case(
        (
            workoutSet.exercise_id.is_(None) & workoutSet.shared_exercise_id.is_(None),
            workoutSet.exercise_name,
        ),
        else_='',
    )
    rows = database.execute(
        select(
            workoutSet.exercise_source,
            workoutSet.exercise_id,
            workoutSet.shared_exercise_id,
            archived_name.label('archived_name'),
            func.max(exercise_name).label('name'),
            target_area.label('target_area'),
            workoutSession.workout_date,
            func.max(workoutSet.weight_kg).label('max_weight'),
            func.max(workoutSet.reps).label('max_reps'),
            func.sum(workoutSet.weight_kg * workoutSet.reps).label('volume'),
            func.count(workoutSet.set_id).label('set_count'),
        )
        .join(workoutSession, workoutSession.session_id == workoutSet.session_id)
        .outerjoin(exerciseItem, exerciseItem.exercise_id == workoutSet.exercise_id)
        .outerjoin(
            sharedExerciseItem, sharedExerciseItem.exercise_id == workoutSet.shared_exercise_id
        )
        .where(workoutSession.user_id == user.user_id)
        .group_by(
            workoutSet.exercise_source,
            workoutSet.exercise_id,
            workoutSet.shared_exercise_id,
            archived_name,
            target_area,
            workoutSession.workout_date,
        )
        .order_by(workoutSession.workout_date)
    )
    exercises = {}
    for row in rows:
        exercise_id = row.shared_exercise_id if row.exercise_source == 'shared' else row.exercise_id
        exercise_key = f'{row.exercise_source}:{exercise_id}:{row.archived_name}'
        exercise = exercises.setdefault(
            exercise_key,
            {
                'exercise_key': exercise_key,
                'exercise_source': row.exercise_source,
                'name': row.name,
                'target_area': row.target_area,
                'archived': exercise_id is None,
                'points': [],
            },
        )
        exercise['points'].append(
            {
                'workout_date': row.workout_date.isoformat(),
                'max_weight': float(row.max_weight),
                'max_reps': row.max_reps,
                'volume': float(row.volume),
                'set_count': row.set_count,
            }
        )
    return sorted(
        exercises.values(), key=lambda exercise: (exercise['name'], exercise['exercise_key'])
    )


def exercise_output(exercise, exercise_source='custom', last_sets=None):
    return {
        'exercise_id': exercise.exercise_id,
        'exercise_source': exercise_source,
        'name': exercise.name,
        'target_area': getattr(exercise, 'target_area', None),
        'target_subarea': getattr(exercise, 'target_subarea', None),
        'last_sets': (exercise.last_sets if last_sets is None else last_sets) or [],
    }


def workout_groups_output(workout_sets):
    groups = []
    current_exercise_order = None
    for workout_set in sorted(workout_sets, key=lambda item: (item.exercise_order, item.set_order)):
        if workout_set.exercise_order != current_exercise_order:
            groups.append(
                {
                    'exercise_source': workout_set.exercise_source,
                    'exercise_id': (
                        workout_set.shared_exercise_id
                        if workout_set.exercise_source == 'shared'
                        else workout_set.exercise_id
                    ),
                    'exercise_name': workout_set.exercise_name,
                    'sets': [],
                }
            )
            current_exercise_order = workout_set.exercise_order
        groups[-1]['sets'].append(
            {
                'weight_kg': float(workout_set.weight_kg),
                'reps': workout_set.reps,
            }
        )
    return groups


def replace_workout_groups(database, user_id, session, exercise_groups: list[exerciseGroupInput]):
    archived_groups = {}
    for saved_set in session.workout_sets:
        if saved_set.exercise_source != 'custom' or saved_set.exercise_id is not None:
            continue
        archived_groups.setdefault(
            saved_set.exercise_order,
            {
                'exercise_name': saved_set.exercise_name,
                'sets': [],
            },
        )['sets'].append(saved_set)

    custom_ids = {
        group.exercise_id for group in exercise_groups if group.exercise_source == 'custom'
    }
    shared_ids = {
        group.exercise_id for group in exercise_groups if group.exercise_source == 'shared'
    }
    custom_exercises = {
        exercise.exercise_id: exercise
        for exercise in database.scalars(
            select(exerciseItem).where(
                exerciseItem.user_id == user_id,
                exerciseItem.exercise_id.in_(custom_ids),
            )
        )
    }
    shared_exercises = {
        exercise.exercise_id: exercise
        for exercise in database.scalars(
            select(sharedExerciseItem).where(sharedExerciseItem.exercise_id.in_(shared_ids))
        )
    }
    archived_names = {group['exercise_name'] for group in archived_groups.values()}
    unresolved_custom_groups = [
        group
        for group in exercise_groups
        if group.exercise_source == 'custom'
        and group.exercise_id not in custom_exercises
        and group.exercise_name not in archived_names
    ]
    if unresolved_custom_groups or len(shared_exercises) != len(shared_ids):
        raise HTTPException(422, '등록되지 않은 운동 종목이 포함되어 있습니다.')

    exercise_keys = [(group.exercise_source, group.exercise_id) for group in exercise_groups]
    if len(exercise_keys) != len(set(exercise_keys)):
        raise HTTPException(422, '같은 운동 종목을 중복으로 기록할 수 없습니다.')

    database.execute(delete(workoutSet).where(workoutSet.session_id == session.session_id))
    database.flush()
    database.expire(session, ['workout_sets'])

    replaced_archived_names = set()
    for exercise_order, group in enumerate(exercise_groups):
        is_archived_group = (
            group.exercise_source == 'custom' and group.exercise_id not in custom_exercises
        )
        if is_archived_group:
            replaced_archived_names.add(group.exercise_name)
            exercise_name = group.exercise_name
        else:
            exercise = (
                shared_exercises[group.exercise_id]
                if group.exercise_source == 'shared'
                else custom_exercises[group.exercise_id]
            )
            exercise_name = exercise.name
            last_sets = [
                {'weight_kg': float(workout_set.weight_kg), 'reps': workout_set.reps}
                for workout_set in group.sets
            ]
            if group.exercise_source == 'shared':
                progress = database.get(userSharedExerciseProgress, (user_id, group.exercise_id))
                if progress is None:
                    progress = userSharedExerciseProgress(
                        user_id=user_id, shared_exercise_id=group.exercise_id, last_sets=last_sets
                    )
                    database.add(progress)
                else:
                    progress.last_sets = last_sets
            else:
                exercise.last_sets = last_sets

        for set_order, workout_set in enumerate(group.sets):
            session.workout_sets.append(
                workoutSet(
                    exercise_id=(
                        None
                        if is_archived_group
                        else exercise.exercise_id
                        if group.exercise_source == 'custom'
                        else None
                    ),
                    shared_exercise_id=(
                        exercise.exercise_id
                        if not is_archived_group and group.exercise_source == 'shared'
                        else None
                    ),
                    exercise_source=group.exercise_source,
                    exercise_name=exercise_name,
                    exercise_order=exercise_order,
                    set_order=set_order,
                    weight_kg=workout_set.weight_kg,
                    reps=workout_set.reps,
                )
            )
    for archived_order, archived_group in enumerate(
        sorted(
            (
                group
                for group in archived_groups.values()
                if group['exercise_name'] not in replaced_archived_names
            ),
            key=lambda item: item['sets'][0].exercise_order,
        )
    ):
        exercise_order = len(exercise_groups) + archived_order
        sorted_saved_sets = sorted(archived_group['sets'], key=lambda item: item.set_order)
        for set_order, saved_set in enumerate(sorted_saved_sets):
            session.workout_sets.append(
                workoutSet(
                    exercise_id=None,
                    shared_exercise_id=None,
                    exercise_source='custom',
                    exercise_name=archived_group['exercise_name'],
                    exercise_order=exercise_order,
                    set_order=set_order,
                    weight_kg=saved_set.weight_kg,
                    reps=saved_set.reps,
                )
            )


@router.get('/exercises', response_model=list[exerciseData])
def list_exercises(
    user: userDependency, database: databaseDependency, before_date: date | None = None
):
    custom_exercises = database.scalars(
        select(exerciseItem).where(exerciseItem.user_id == user.user_id)
    ).all()
    shared_exercises = database.scalars(select(sharedExerciseItem)).all()
    previous_sets = latest_sets_by_exercise(database, user.user_id, before_date)
    exercises = [
        exercise_output(exercise, last_sets=previous_sets.get(('custom', exercise.exercise_id), []))
        for exercise in custom_exercises
    ]
    exercises.extend(
        exercise_output(exercise, 'shared', previous_sets.get(('shared', exercise.exercise_id), []))
        for exercise in shared_exercises
    )
    return sorted(exercises, key=lambda exercise: (exercise['name'], exercise['exercise_source']))


def latest_sets_by_exercise(database, user_id, before_date=None):
    referenced_exercise_id = case(
        (workoutSet.exercise_source == 'shared', workoutSet.shared_exercise_id),
        else_=workoutSet.exercise_id,
    )
    ranked_sets = (
        select(
            workoutSet.exercise_source,
            referenced_exercise_id.label('exercise_id'),
            workoutSet.weight_kg,
            workoutSet.reps,
            workoutSet.exercise_order,
            workoutSet.set_order,
            func.dense_rank()
            .over(
                partition_by=(workoutSet.exercise_source, referenced_exercise_id),
                order_by=workoutSession.workout_date.desc(),
            )
            .label('session_rank'),
        )
        .join(workoutSession, workoutSession.session_id == workoutSet.session_id)
        .where(workoutSession.user_id == user_id, referenced_exercise_id.is_not(None))
    )
    if before_date is not None:
        ranked_sets = ranked_sets.where(workoutSession.workout_date < before_date)
    previous_sets = ranked_sets.subquery('previous_exercise_sets')
    rows = database.execute(
        select(previous_sets)
        .where(previous_sets.c.session_rank == 1)
        .order_by(
            previous_sets.c.exercise_source,
            previous_sets.c.exercise_id,
            previous_sets.c.exercise_order,
            previous_sets.c.set_order,
        )
    )
    sets_by_exercise = {}
    for row in rows:
        exercise_key = (row.exercise_source, row.exercise_id)
        sets_by_exercise.setdefault(exercise_key, []).append(
            {'weight_kg': float(row.weight_kg), 'reps': row.reps}
        )
    return sets_by_exercise


@router.post('/exercises', response_model=exerciseData, status_code=201)
def create_exercise(payload: exerciseInput, user: userDependency, database: databaseDependency):
    database.scalar(
        select(userAccount).where(userAccount.user_id == user.user_id).with_for_update()
    )
    if database.scalar(
        select(sharedExerciseItem.exercise_id).where(
            func.lower(sharedExerciseItem.name) == payload.name.lower()
        )
    ):
        raise HTTPException(409, '기본 운동 종목에 이미 등록되어 있습니다.')
    count = database.scalar(
        select(func.count()).select_from(exerciseItem).where(exerciseItem.user_id == user.user_id)
    )
    if count >= 100:
        raise HTTPException(422, '운동 종목은 최대 100개까지 등록할 수 있습니다.')
    exercise = exerciseItem(
        user_id=user.user_id,
        name=payload.name,
        target_area=payload.target_area,
        target_subarea=payload.target_subarea,
        last_sets=[],
    )
    database.add(exercise)
    try:
        database.commit()
    except IntegrityError:
        database.rollback()
        raise HTTPException(409, '이미 등록한 운동 종목입니다.') from None
    return exercise_output(exercise)


@router.put('/exercises/custom/{exercise_id}', response_model=exerciseData)
def rename_exercise(
    exercise_id: int, payload: exerciseInput, user: userDependency, database: databaseDependency
):
    exercise = database.scalar(
        select(exerciseItem).where(
            exerciseItem.exercise_id == exercise_id, exerciseItem.user_id == user.user_id
        )
    )
    if exercise is None:
        raise HTTPException(404, '운동 종목을 찾을 수 없습니다.')
    if database.scalar(
        select(sharedExerciseItem.exercise_id).where(
            func.lower(sharedExerciseItem.name) == payload.name.lower()
        )
    ):
        raise HTTPException(409, '기본 운동 종목에 이미 등록되어 있습니다.')
    exercise.name = payload.name
    exercise.target_area = payload.target_area
    exercise.target_subarea = payload.target_subarea
    try:
        database.commit()
    except IntegrityError:
        database.rollback()
        raise HTTPException(409, '이미 등록한 운동 종목입니다.') from None
    return exercise_output(exercise)


@router.delete('/exercises/custom/{exercise_id}', status_code=204)
def delete_exercise(
    exercise_id: int, user: userDependency, database: databaseDependency, response: Response
):
    exercise = database.scalar(
        select(exerciseItem).where(
            exerciseItem.exercise_id == exercise_id, exerciseItem.user_id == user.user_id
        )
    )
    if exercise is None:
        raise HTTPException(404, '운동 종목을 찾을 수 없습니다.')
    database.delete(exercise)
    database.commit()
    response.status_code = 204
    return response
