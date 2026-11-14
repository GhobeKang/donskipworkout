"""Personal bests use the weight and repetitions from one actual logged set."""

from collections import defaultdict

from sqlalchemy import case, func, select

from .database import workoutSession, workoutSet


def exercise_key(workout_set):
    exercise_id = (
        workout_set.shared_exercise_id
        if workout_set.exercise_source == 'shared'
        else workout_set.exercise_id
    )
    return (workout_set.exercise_source, exercise_id) if exercise_id is not None else None


def best_sets_by_exercise(workout_sets):
    best_sets = {}
    for workout_set in workout_sets:
        identity = exercise_key(workout_set)
        if identity is None:
            continue
        previous = best_sets.get(identity)
        if previous is None or (
            workout_set.weight_kg,
            workout_set.reps,
            -workout_set.workout_date.toordinal(),
        ) > (previous.weight_kg, previous.reps, -previous.workout_date.toordinal()):
            best_sets[identity] = workout_set
    return best_sets


def personal_best_output(workout_set):
    return {
        'weight_kg': float(workout_set.weight_kg),
        'reps': workout_set.reps,
        'workout_date': workout_set.workout_date.isoformat(),
    }


def personal_record_achievements(historical_sets, current_sets):
    previous_bests = best_sets_by_exercise(historical_sets)
    sets_by_date = defaultdict(list)
    for workout_set in current_sets:
        sets_by_date[workout_set.workout_date].append(workout_set)
    records = {}
    for workout_date in sorted(sets_by_date):
        for identity, current in best_sets_by_exercise(sets_by_date[workout_date]).items():
            previous = previous_bests.get(identity)
            if previous is None:
                # An exercise's first workout day establishes its baseline.
                previous_bests[identity] = current
                continue
            if (current.weight_kg, current.reps) <= (previous.weight_kg, previous.reps):
                continue
            record = records.setdefault(
                identity,
                {
                    'exercise_source': identity[0],
                    'exercise_id': identity[1],
                    'exercise_name': current.exercise_name,
                    'previous_best': personal_best_output(previous),
                },
            )
            record['exercise_name'] = current.exercise_name
            record['current_best'] = personal_best_output(current)
            previous_bests[identity] = current
    return sorted(
        records.values(),
        key=lambda item: (
            item['current_best']['workout_date'],
            item['exercise_source'],
            item['exercise_id'],
        ),
        reverse=True,
    )


def previous_bests_by_exercise(database, user_id, before_date):
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
            workoutSession.workout_date,
            func.row_number()
            .over(
                partition_by=(workoutSet.exercise_source, referenced_exercise_id),
                order_by=(
                    workoutSet.weight_kg.desc(),
                    workoutSet.reps.desc(),
                    workoutSession.workout_date,
                    workoutSet.set_id,
                ),
            )
            .label('record_rank'),
        )
        .join(workoutSession, workoutSession.session_id == workoutSet.session_id)
        .where(workoutSession.user_id == user_id, referenced_exercise_id.is_not(None))
    )
    if before_date is not None:
        ranked_sets = ranked_sets.where(workoutSession.workout_date < before_date)
    ranked_sets = ranked_sets.subquery('ranked_personal_bests')
    return {
        (row.exercise_source, row.exercise_id): personal_best_output(row)
        for row in database.execute(select(ranked_sets).where(ranked_sets.c.record_rank == 1))
    }
