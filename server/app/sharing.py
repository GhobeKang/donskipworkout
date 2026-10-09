from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import noload

from .database import weeklyPromise, workoutSession
from .personal_report import personal_report_output


def monday_of(workout_date):
    return workout_date - timedelta(days=workout_date.weekday())


def promise_for_week(database, user_id, week_start):
    return database.scalar(
        select(weeklyPromise)
        .where(weeklyPromise.user_id == user_id, weeklyPromise.effective_week <= week_start)
        .order_by(weeklyPromise.effective_week.desc())
        .limit(1)
    )


def schedule_next_promise(database, user_id, target_count, today):
    effective_week = monday_of(today) + timedelta(days=7)
    next_promise = database.get(weeklyPromise, (user_id, effective_week))
    if next_promise:
        next_promise.target_count = target_count
    else:
        database.add(
            weeklyPromise(
                user_id=user_id,
                effective_week=effective_week,
                target_count=target_count,
                baseline_date=effective_week,
            )
        )


def best_repetitions(sessions):
    best_sets = {}
    for session in sessions:
        for workout_set in session.workout_sets:
            exercise_id = (
                workout_set.shared_exercise_id
                if workout_set.exercise_source == 'shared'
                else workout_set.exercise_id
            )
            # Deleted custom exercises cannot be safely matched by name.
            if exercise_id is None:
                continue
            set_key = (workout_set.exercise_source, exercise_id, workout_set.weight_kg)
            if set_key not in best_sets or workout_set.reps > best_sets[set_key].reps:
                best_sets[set_key] = workout_set
    return best_sets


def growth_for_weeks(previous_sessions, current_sessions):
    previous_sets = best_repetitions(previous_sessions)
    current_sets = best_repetitions(current_sessions)
    comparable_keys = previous_sets.keys() & current_sets.keys()
    improved_keys = [
        key for key in comparable_keys if current_sets[key].reps > previous_sets[key].reps
    ]
    if not improved_keys:
        return {'status': 'no_increase' if comparable_keys else 'insufficient_data'}
    best_key = max(
        sorted(improved_keys), key=lambda key: current_sets[key].reps - previous_sets[key].reps
    )
    current_set = current_sets[best_key]
    return {
        'status': 'improved',
        'exercise_name': current_set.exercise_name,
        'exercise_source': current_set.exercise_source,
        'weight_kg': float(current_set.weight_kg),
        'previous_reps': previous_sets[best_key].reps,
        'current_reps': current_set.reps,
    }


def weekly_share_output(database, user_id, today, week_offset):
    week_start = monday_of(today) - timedelta(weeks=week_offset)
    week_end = week_start + timedelta(days=6)
    promise = promise_for_week(database, user_id, week_start)
    sessions = database.scalars(
        select(workoutSession)
        .options(noload(workoutSession.photos))
        .where(
            workoutSession.user_id == user_id,
            workoutSession.session_status == 'completed',
            workoutSession.workout_date >= week_start - timedelta(days=7),
            workoutSession.workout_date <= min(today, week_end),
        )
        .order_by(workoutSession.workout_date)
    ).all()
    current_sessions = [session for session in sessions if session.workout_date >= week_start]
    previous_sessions = [session for session in sessions if session.workout_date < week_start]
    completed_count = len(current_sessions)
    target_count = promise.target_count if promise else None
    # The feature-start / signup week did not have a full pre-committed week.
    is_baseline_week = bool(promise and promise.baseline_date > week_start)
    is_evaluable = bool(target_count and not is_baseline_week)
    next_promise = promise_for_week(database, user_id, week_start + timedelta(days=7))
    return {
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
        'as_of_date': min(today, week_end).isoformat(),
        'is_current_week': week_offset == 0,
        'is_baseline_week': is_baseline_week,
        'target_count': target_count,
        'next_target_count': next_promise.target_count if next_promise else None,
        'completed_count': completed_count,
        'promise_percent': min(100, round(completed_count / target_count * 100))
        if is_evaluable
        else None,
        'extra_count': max(0, completed_count - target_count) if is_evaluable else None,
        'growth': growth_for_weeks(previous_sessions, current_sessions),
        'insights': personal_report_output(
            database, user_id, week_start, min(today, week_end), week_offset == 0
        ),
    }


def period_report_output(database, user_id, today, period_type, selected_date):
    if period_type == 'weekly':
        period_start = monday_of(selected_date)
        week_offset = (monday_of(today) - period_start).days // 7
        report = weekly_share_output(database, user_id, today, week_offset)
        return {
            **report,
            'period_type': period_type,
            'period_start': report['week_start'],
            'period_end': report['week_end'],
            'is_current_period': report['is_current_week'],
        }

    period_start = selected_date.replace(day=1)
    next_month = (period_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    period_end = next_month - timedelta(days=1)
    as_of_date = min(today, period_end)
    is_current_period = period_start == today.replace(day=1)
    previous_month_end = period_start - timedelta(days=1)
    previous_start = previous_month_end.replace(day=1)
    previous_end = (
        min(previous_month_end, previous_start + (as_of_date - period_start))
        if is_current_period
        else previous_month_end
    )
    insights = personal_report_output(
        database,
        user_id,
        period_start,
        as_of_date,
        is_current_period,
        period_type,
        previous_start,
        previous_end,
    )
    return {
        'period_type': period_type,
        'period_start': period_start.isoformat(),
        'period_end': period_end.isoformat(),
        'is_current_period': is_current_period,
        'week_start': period_start.isoformat(),
        'week_end': period_end.isoformat(),
        'as_of_date': as_of_date.isoformat(),
        'is_current_week': False,
        'is_baseline_week': False,
        'target_count': None,
        'next_target_count': None,
        'completed_count': insights['coverage']['completed_count'],
        'promise_percent': None,
        'extra_count': None,
        'growth': {'status': 'insufficient_data'},
        'insights': insights,
    }
