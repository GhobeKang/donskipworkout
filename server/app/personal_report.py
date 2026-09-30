"""Evidence-based personal comparisons; no population ranking or fitness estimates."""

from collections import Counter, defaultdict
from datetime import timedelta

from sqlalchemy import select

from .database import weeklyPromise, workoutSession, workoutSet


def exercise_key(workout_set):
    exercise_id = (
        workout_set.shared_exercise_id
        if workout_set.exercise_source == 'shared'
        else workout_set.exercise_id
    )
    return (workout_set.exercise_source, exercise_id) if exercise_id is not None else None


def exercise_identity(workout_set):
    return {
        'exercise_source': workout_set.exercise_source,
        'exercise_id': exercise_key(workout_set)[1],
        'exercise_name': workout_set.exercise_name,
    }


def best_conditions(workout_sets, dimension):
    best_sets = {}
    for workout_set in workout_sets:
        identity = exercise_key(workout_set)
        if identity is None:
            continue
        condition = workout_set.weight_kg if dimension == 'reps' else workout_set.reps
        value = workout_set.reps if dimension == 'reps' else workout_set.weight_kg
        condition_key = (*identity, condition)
        previous = best_sets.get(condition_key)
        # Use the earliest occurrence of an equal best, so dates are deterministic.
        if previous is None or value > previous[0]:
            best_sets[condition_key] = (value, workout_set)
    return best_sets


def compare_conditions(previous_sets, current_sets):
    comparisons = []
    for dimension in ('reps', 'weight_kg'):
        previous_best = best_conditions(previous_sets, dimension)
        current_best = best_conditions(current_sets, dimension)
        for condition_key in sorted(previous_best.keys() & current_best.keys()):
            previous_value, previous_set = previous_best[condition_key]
            current_value, current_set = current_best[condition_key]
            delta = current_value - previous_value
            comparisons.append(
                {
                    **exercise_identity(current_set),
                    'dimension': dimension,
                    'condition_value': float(condition_key[2]),
                    'previous_value': float(previous_value),
                    'current_value': float(current_value),
                    'delta': float(delta),
                    'percent_change': round(float(delta / previous_value * 100), 1)
                    if previous_value
                    else None,
                    'direction': 'improved'
                    if delta > 0
                    else 'declined'
                    if delta < 0
                    else 'maintained',
                    'previous_date': previous_set.workout_date.isoformat(),
                    'current_date': current_set.workout_date.isoformat(),
                }
            )
    return comparisons


def comparison_summary(previous_sets, current_sets):
    comparisons = compare_conditions(previous_sets, current_sets)
    current_keys = {exercise_key(item) for item in current_sets if exercise_key(item)}
    comparable_keys = {(item['exercise_source'], item['exercise_id']) for item in comparisons}
    counts = {}
    for direction in ('improved', 'maintained', 'declined'):
        counts[f'{direction}_count'] = len(
            {
                (item['exercise_source'], item['exercise_id'])
                for item in comparisons
                if item['direction'] == direction
            }
        )
    return {
        **counts,
        'exercise_count': len(current_keys),
        'comparable_count': len(comparable_keys),
        'uncomparable_count': len(current_keys - comparable_keys),
        'comparisons': comparisons,
    }


def promise_history(goal_changes, completed_dates, week_start, as_of_date):
    # At most 52 closed weeks plus the selected week. No current settings reconstruction.
    history_start = week_start - timedelta(weeks=52)
    weeks = []
    goal_index = 0
    active_goal = None
    current_week = history_start
    date_counts = Counter(day - timedelta(days=day.weekday()) for day in completed_dates)
    while current_week <= week_start:
        while (
            goal_index < len(goal_changes)
            and goal_changes[goal_index].effective_week <= current_week
        ):
            active_goal = goal_changes[goal_index]
            goal_index += 1
        week_end = current_week + timedelta(days=6)
        is_closed = week_end < as_of_date or (current_week < week_start)
        # Even Sunday remains in progress until the next Monday.
        target_count = active_goal.target_count if active_goal else None
        completed_count = date_counts[current_week]
        if active_goal is None or active_goal.baseline_date > current_week:
            status = 'unknown'
        elif target_count == 0:
            status = 'rest'
        elif not is_closed:
            status = 'in_progress'
        else:
            status = 'kept' if completed_count >= target_count else 'missed'
        weeks.append(
            {
                'week_start': current_week.isoformat(),
                'target_count': target_count,
                'completed_count': completed_count,
                'status': status,
            }
        )
        current_week += timedelta(weeks=1)
    # Avoid presenting 52 empty weeks before a user's first saved goal as history.
    while weeks and weeks[0]['status'] == 'unknown':
        weeks.pop(0)
    current_streak = longest_streak = 0
    for week in weeks:
        if week['status'] == 'kept':
            current_streak += 1
            longest_streak = max(longest_streak, current_streak)
        elif week['status'] in {'missed', 'unknown'}:
            current_streak = 0
    closed_weeks = [week for week in weeks if week['status'] in {'kept', 'missed'}]
    return {
        'evaluated_weeks': len(closed_weeks),
        'kept_weeks': sum(week['status'] == 'kept' for week in closed_weeks),
        'current_streak': current_streak,
        'longest_streak': longest_streak,
        'weeks': weeks,
    }


def recovery_history(weeks, completed_dates):
    events = []
    previous_week = None
    for week in weeks:
        if week['status'] == 'rest':
            continue  # Planned zero-goal weeks pause the next opportunity.
        if week['status'] == 'unknown':
            previous_week = None
            continue
        if previous_week and previous_week['status'] == 'missed':
            start_date = week['week_start']
            return_dates = [
                day.isoformat()
                for day in completed_dates
                if (day - timedelta(days=day.weekday())).isoformat() == start_date
            ]
            events.append(
                {
                    'missed_week': previous_week['week_start'],
                    'return_week': start_date,
                    'first_return_date': min(return_dates) if return_dates else None,
                    'status': 'recovered'
                    if week['status'] == 'kept'
                    else 'pending'
                    if week['status'] == 'in_progress'
                    else 'not_recovered',
                }
            )
        previous_week = week
    resolved = [event for event in events if event['status'] != 'pending']
    recovered_count = sum(event['status'] == 'recovered' for event in resolved)
    return {
        'opportunity_count': len(resolved),
        'recovered_count': recovered_count,
        'recovery_percent': round(recovered_count / len(resolved) * 100) if resolved else None,
        'pending_count': len(events) - len(resolved),
        'events': events,
    }


def evaluate_report(recent, journey, consistency, recovery, challenges, completed_count):
    # Transparent rule composition, not an invented weighted score.
    has_growth = recent['improved_count'] > 0
    has_decline = recent['declined_count'] > 0
    has_consistency = consistency['current_streak'] >= 3
    latest_recovery = recovery['events'][-1] if recovery['events'] else None
    latest_week = consistency['weeks'][-1]['week_start'] if consistency['weeks'] else None
    is_returning = bool(
        latest_recovery
        and latest_recovery['return_week'] == latest_week
        and latest_recovery['first_return_date']
    )
    if completed_count == 0:
        profile = 'no_activity'
    elif has_growth and has_decline:
        profile = 'mixed_progress'
    elif has_decline:
        profile = 'review_conditions'
    elif is_returning:
        profile = 'returning'
    elif has_growth and has_consistency:
        profile = 'consistent_progress'
    elif has_growth:
        profile = 'progressing'
    elif has_consistency:
        profile = 'consistent'
    elif challenges['new_exercises']:
        profile = 'exploring'
    elif recent['comparable_count']:
        profile = 'maintaining'
    else:
        profile = 'building_baseline'
    evidence_codes = []
    for condition, code in (
        (has_growth, 'recent_improvement'),
        (has_decline, 'recent_decline'),
        (journey['improved_count'] > 0, 'long_term_improvement'),
        (has_consistency, 'consistent_weeks'),
        (is_returning, 'returned_after_miss'),
        (bool(challenges['personal_records']), 'personal_record'),
        (bool(challenges['new_exercises']), 'new_exercise'),
        (recent['uncomparable_count'] > 0, 'incomplete_comparison'),
    ):
        if condition:
            evidence_codes.append(code)
    focus_code = (
        'log_comparable_sets'
        if not recent['comparable_count']
        else 'review_comparison'
        if has_decline
        else 'keep_next_promise'
        if not has_consistency
        else 'maintain_own_pace'
    )
    return {
        'profile': profile,
        'evidence_codes': evidence_codes,
        'focus_code': focus_code,
        'method_version': 'personal_report_v1',
    }


def personal_report_output(database, user_id, week_start, as_of_date, is_current_week):
    completed_dates = database.scalars(
        select(workoutSession.workout_date)
        .where(
            workoutSession.user_id == user_id,
            workoutSession.session_status == 'completed',
            workoutSession.workout_date <= as_of_date,
        )
        .order_by(workoutSession.workout_date)
    ).all()
    # Project only needed fields. Never load photos, private notes or ORM relationships.
    set_rows = database.execute(
        select(
            workoutSet.exercise_source,
            workoutSet.exercise_id,
            workoutSet.shared_exercise_id,
            workoutSet.exercise_name,
            workoutSet.weight_kg,
            workoutSet.reps,
            workoutSession.workout_date,
        )
        .join(workoutSession, workoutSession.session_id == workoutSet.session_id)
        .where(
            workoutSession.user_id == user_id,
            workoutSession.session_status == 'completed',
            workoutSession.workout_date <= as_of_date,
        )
        .order_by(workoutSession.workout_date, workoutSet.set_id)
    ).all()
    valid_sets = [item for item in set_rows if exercise_key(item)]
    previous_start = week_start - timedelta(days=7)
    previous_end = as_of_date - timedelta(days=7)
    current_sets = [item for item in valid_sets if item.workout_date >= week_start]
    previous_sets = [
        item for item in valid_sets if previous_start <= item.workout_date <= previous_end
    ]
    recent = comparison_summary(previous_sets, current_sets)

    sets_by_exercise = defaultdict(list)
    for item in valid_sets:
        sets_by_exercise[exercise_key(item)].append(item)
    first_sets, latest_sets = [], []
    new_exercises = []
    for exercise_sets in sets_by_exercise.values():
        first_date, latest_date = exercise_sets[0].workout_date, exercise_sets[-1].workout_date
        if first_date >= week_start:
            new_exercises.append(
                {**exercise_identity(exercise_sets[-1]), 'first_date': first_date.isoformat()}
            )
        if first_date < latest_date:
            first_sets.extend(item for item in exercise_sets if item.workout_date == first_date)
            latest_sets.extend(item for item in exercise_sets if item.workout_date == latest_date)
        else:
            latest_sets.extend(exercise_sets)
    journey = comparison_summary(first_sets, latest_sets)
    historical_sets = [item for item in valid_sets if item.workout_date < week_start]
    personal_records = [
        item
        for item in compare_conditions(historical_sets, current_sets)
        if item['direction'] == 'improved'
    ]
    challenges = {
        'new_exercises': new_exercises,
        'personal_records': personal_records,
        'record_exercise_count': len(
            {(item['exercise_source'], item['exercise_id']) for item in personal_records}
        ),
    }

    goal_changes = database.scalars(
        select(weeklyPromise)
        .where(
            weeklyPromise.user_id == user_id,
            weeklyPromise.effective_week <= week_start,
        )
        .order_by(weeklyPromise.effective_week)
    ).all()
    # For a completed report, Sunday is closed; for this week's report it is still provisional.
    closure_date = as_of_date if is_current_week else as_of_date + timedelta(days=1)
    consistency = promise_history(goal_changes, completed_dates, week_start, closure_date)
    recovery = recovery_history(consistency['weeks'], completed_dates)

    current_days = {item.workout_date for item in current_sets}
    previous_days = {item.workout_date for item in previous_sets}
    preferences = []
    for identity, exercise_sets in sets_by_exercise.items():
        current_exercise_days = {
            item.workout_date for item in current_sets if exercise_key(item) == identity
        }
        previous_exercise_days = {
            item.workout_date for item in previous_sets if exercise_key(item) == identity
        }
        if not current_exercise_days and not previous_exercise_days:
            continue
        current_percent = (
            round(len(current_exercise_days) / len(current_days) * 100) if current_days else None
        )
        previous_percent = (
            round(len(previous_exercise_days) / len(previous_days) * 100) if previous_days else None
        )
        preferences.append(
            {
                **exercise_identity(exercise_sets[-1]),
                'session_count': len(current_exercise_days),
                'previous_session_count': len(previous_exercise_days),
                'session_percent': current_percent,
                'previous_session_percent': previous_percent,
            }
        )
    preferences.sort(
        key=lambda item: (-item['session_count'], item['exercise_source'], item['exercise_id'])
    )
    current_dates = [day for day in completed_dates if day >= week_start]
    return {
        'comparison_start': previous_start.isoformat(),
        'comparison_end': previous_end.isoformat(),
        'history_start': completed_dates[0].isoformat() if completed_dates else None,
        'recent': recent,
        'journey': journey,
        'consistency': consistency,
        'recovery': recovery,
        'challenges': challenges,
        'preferences': preferences,
        'coverage': {
            'completed_count': len(current_dates),
            'recorded_count': len(current_days),
            'previous_recorded_count': len(previous_days),
            'excluded_set_count': sum(
                exercise_key(item) is None for item in set_rows if item.workout_date >= week_start
            ),
        },
        'evaluation': evaluate_report(
            recent, journey, consistency, recovery, challenges, len(current_dates)
        ),
    }
