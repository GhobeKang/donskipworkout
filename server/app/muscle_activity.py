"""Period activity from saved sets, independent of attendance and external load."""

from sqlalchemy import and_, case, func, select

from .database import exerciseItem, sharedExerciseItem, workoutSession, workoutSet


def activity_rows(database, user_id, start_date, end_date):
    exercise_id = case(
        (workoutSet.exercise_source == 'shared', workoutSet.shared_exercise_id),
        else_=workoutSet.exercise_id,
    )
    exercise_name = func.coalesce(
        sharedExerciseItem.name, exerciseItem.name, workoutSet.exercise_name,
    )
    target_area = func.coalesce(sharedExerciseItem.target_area, exerciseItem.target_area)
    target_subarea = func.coalesce(
        sharedExerciseItem.target_subarea, exerciseItem.target_subarea,
    )
    return database.execute(
        select(
            workoutSession.workout_date,
            workoutSet.exercise_source,
            exercise_id.label('exercise_id'),
            exercise_name.label('exercise_name'),
            target_area.label('target_area'),
            target_subarea.label('target_subarea'),
            func.count(workoutSet.set_id).label('set_count'),
        )
        .join(workoutSession, workoutSession.session_id == workoutSet.session_id)
        .outerjoin(exerciseItem, and_(
            workoutSet.exercise_source == 'custom',
            exerciseItem.exercise_id == workoutSet.exercise_id,
            exerciseItem.user_id == user_id,
        ))
        .outerjoin(sharedExerciseItem, and_(
            workoutSet.exercise_source == 'shared',
            sharedExerciseItem.exercise_id == workoutSet.shared_exercise_id,
        ))
        .where(
            workoutSession.user_id == user_id,
            workoutSession.workout_date >= start_date,
            workoutSession.workout_date <= end_date,
        )
        .group_by(
            workoutSession.workout_date, workoutSet.exercise_source, exercise_id,
            exercise_name, target_area, target_subarea,
        )
        .order_by(workoutSession.workout_date, exercise_name)
    ).all()


def activity_summary(rows, start_date, end_date):
    targets = {}
    exercise_keys = set()
    workout_dates = set()
    total_sets = 0
    for row in rows:
        if not start_date <= row.workout_date <= end_date:
            continue
        # Deleted exercises retain their saved name, even though their ID is cleared.
        exercise_key = (
            f'{row.exercise_source}:{row.exercise_id}' if row.exercise_id is not None
            else f'{row.exercise_source}:archived:{row.exercise_name}'
        )
        exercise_keys.add(exercise_key)
        workout_date = row.workout_date.isoformat()
        workout_dates.add(workout_date)
        total_sets += row.set_count
        target_key = (row.target_area, row.target_subarea)
        target = targets.setdefault(target_key, {
            'target_area': row.target_area, 'target_subarea': row.target_subarea,
            'set_count': 0, 'exercises': {}, 'workout_dates': set(),
        })
        target['set_count'] += row.set_count
        target['workout_dates'].add(workout_date)
        exercise = target['exercises'].setdefault(exercise_key, {
            'exercise_key': exercise_key, 'exercise_source': row.exercise_source,
            'exercise_id': row.exercise_id, 'exercise_name': row.exercise_name,
            'set_count': 0,
        })
        exercise['set_count'] += row.set_count
    target_rows = []
    for target in targets.values():
        exercise_count = len(target['exercises'])
        target_rows.append({
            **target, 'exercises': list(target['exercises'].values()),
            'workout_dates': sorted(target['workout_dates']),
            'exercise_count': exercise_count,
            'activity_score': exercise_count + target['set_count'],
        })
    target_rows.sort(key=lambda target: (
        -target['activity_score'], target['target_area'] or '', target['target_subarea'] or '',
    ))
    return {
        'start_date': start_date.isoformat(), 'end_date': end_date.isoformat(),
        'exercise_count': len(exercise_keys), 'set_count': total_sets,
        'activity_score': len(exercise_keys) + total_sets,
        'recorded_day_count': len(workout_dates), 'targets': target_rows,
        'unclassified_set_count': sum(
            target['set_count'] for target in target_rows if not target['target_area']
        ),
    }


def muscle_activity_comparison(
    database, user_id, start_date, end_date, previous_start, previous_end,
):
    rows = activity_rows(database, user_id, min(start_date, previous_start), end_date)
    return {
        'current': activity_summary(rows, start_date, end_date),
        'previous': activity_summary(rows, previous_start, previous_end),
    }
