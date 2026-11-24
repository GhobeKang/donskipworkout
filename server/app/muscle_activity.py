"""Recorded training load relative to up to 28 observed days before each report."""

from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal
from types import SimpleNamespace

from sqlalchemy import and_, case, func, select

from .database import exerciseItem, sharedExerciseItem, workoutSession, workoutSet
from .exercise_subareas import report_training_subareas, subareas_by_exercise
from .workout_load import effective_weight_kg


def activity_rows(database, user_id, start_date, end_date):
    exercise_id = case(
        (workoutSet.exercise_source == 'shared', workoutSet.shared_exercise_id),
        else_=workoutSet.exercise_id,
    )
    exercise_name = func.coalesce(
        sharedExerciseItem.name, exerciseItem.name, workoutSet.exercise_name,
    )
    target_area = func.coalesce(sharedExerciseItem.target_area, exerciseItem.target_area)
    rows = database.execute(
        select(
            workoutSession.workout_date,
            workoutSet.exercise_source,
            exercise_id.label('exercise_id'),
            exercise_name.label('exercise_name'),
            target_area.label('target_area'),
            workoutSet.set_id,
            workoutSet.weight_kg,
            workoutSet.body_weight_kg,
            workoutSet.reps,
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
        .order_by(workoutSession.workout_date, exercise_name, workoutSet.set_id)
    ).all()
    targets = subareas_by_exercise(database, user_id)
    return [SimpleNamespace(
        **row._mapping, target_subareas=targets.get((row.exercise_source, row.exercise_id), []),
    ) for row in rows]


def activity_load_totals():
    return {
        'set_count': 0, 'volume_kg': Decimal('0'), 'excluded_set_count': 0,
        'baseline_set_count': 0, 'baseline_volume_kg': Decimal('0'),
        'baseline_excluded_set_count': 0, 'baseline_matched_volume_kg': Decimal('0'),
        'baseline_matched_excluded_set_count': 0,
    }


def add_activity_set(totals, record, is_baseline):
    prefix = 'baseline_' if is_baseline else ''
    totals[f'{prefix}set_count'] += 1
    if record['volume_kg'] is None:
        totals[f'{prefix}excluded_set_count'] += 1
        if is_baseline and record['included_in_reference']:
            totals['baseline_matched_excluded_set_count'] += 1
    else:
        totals[f'{prefix}volume_kg'] += record['volume_kg']
        if is_baseline and record['included_in_reference']:
            totals['baseline_matched_volume_kg'] += record['volume_kg']


def activity_load_output(totals, reference_scale, has_baseline_period):
    reference_volume = totals['baseline_matched_volume_kg'] * reference_scale
    if totals['excluded_set_count'] or totals['baseline_matched_excluded_set_count']:
        score_status = 'incomplete_load_data'
    elif not has_baseline_period:
        score_status = 'insufficient_history'
    elif reference_volume <= 0:
        score_status = 'no_baseline'
    else:
        score_status = 'comparable'
    return {
        **{key: float(value) if isinstance(value, Decimal) else value
           for key, value in totals.items()},
        'reference_volume_kg': float(reference_volume),
        'activity_score': float((totals['volume_kg'] / reference_volume * 100).quantize(
            Decimal('0.1'), rounding=ROUND_HALF_UP,
        ))
        if score_status == 'comparable' else None,
        'score_status': score_status,
    }


def activity_summary(rows, start_date, end_date, period_type='weekly', history_start=None):
    baseline_start = (
        max(start_date - timedelta(days=28), history_start)
        if history_start is not None else start_date
    )
    baseline_end = start_date - timedelta(days=1)
    baseline_day_count = max(0, (baseline_end - baseline_start).days + 1)
    baseline_dates = {
        baseline_start + timedelta(days=offset) for offset in range(baseline_day_count)
    }
    period_day_count = (end_date - start_date).days + 1
    period_weekdays = {
        (start_date + timedelta(days=offset)).weekday() for offset in range(period_day_count)
    }
    reference_dates = {
        day for day in baseline_dates if day.weekday() in period_weekdays
    } if period_type == 'weekly' else baseline_dates
    # A new user's history may only cover other weekdays. Use its daily average
    # until matching weekdays are available, and expose that choice in the evidence.
    baseline_sampling_method = (
        'matching_weekdays' if reference_dates and period_type == 'weekly' else 'daily_average'
    )
    if not reference_dates:
        reference_dates = baseline_dates
    baseline_sample_day_count = len(reference_dates)
    reference_scale = (
        Decimal(period_day_count) / baseline_sample_day_count
        if baseline_sample_day_count else Decimal('0')
    )
    has_baseline_period = baseline_sample_day_count > 0
    targets = {}
    exercise_keys = set()
    workout_dates = set()
    totals = activity_load_totals()
    unclassified_set_count = 0
    for row in rows:
        is_baseline = baseline_start <= row.workout_date <= baseline_end
        if not is_baseline and not start_date <= row.workout_date <= end_date:
            continue
        # Deleted exercises retain their saved name, even though their ID is cleared.
        exercise_key = (
            f'{row.exercise_source}:{row.exercise_id}' if row.exercise_id is not None
            else f'{row.exercise_source}:archived:{row.exercise_name}'
        )
        workout_date = row.workout_date.isoformat()
        effective_weight = effective_weight_kg(row)
        record = {
            'set_id': row.set_id, 'workout_date': workout_date,
            'weight_kg': row.weight_kg, 'body_weight_kg': row.body_weight_kg,
            'effective_weight_kg': effective_weight, 'reps': row.reps,
            'volume_kg': effective_weight * row.reps if effective_weight is not None else None,
            'included_in_reference': not is_baseline or row.workout_date in reference_dates,
        }
        add_activity_set(totals, record, is_baseline)
        if not is_baseline:
            exercise_keys.add(exercise_key)
            workout_dates.add(workout_date)
            if not row.target_area and not row.target_subareas:
                unclassified_set_count += 1
        row_targets = report_training_subareas(row.target_area, row.target_subareas) or [{
            'subarea_id': None, 'target_area': row.target_area, 'label_ko': None,
            'label_en': None, 'atlas_muscle_ids': None, 'is_legacy': False,
        }]
        for subarea in row_targets:
            target_key = subarea['subarea_id'] or ('area', row.target_area)
            target = targets.setdefault(target_key, {
                **{field: subarea[field] for field in (
                    'subarea_id', 'target_area', 'label_ko', 'label_en',
                    'atlas_muscle_ids', 'is_legacy',
                )},
                'target_subarea': subarea['label_ko'],
                **activity_load_totals(), 'exercises': {}, 'workout_dates': set(),
            })
            add_activity_set(target, record, is_baseline)
            if not is_baseline:
                target['workout_dates'].add(workout_date)
            exercise = target['exercises'].setdefault(exercise_key, {
                'exercise_key': exercise_key, 'exercise_source': row.exercise_source,
                'exercise_id': row.exercise_id, 'exercise_name': row.exercise_name,
                **activity_load_totals(), 'sets': [], 'baseline_sets': [],
            })
            add_activity_set(exercise, record, is_baseline)
            exercise['baseline_sets' if is_baseline else 'sets'].append(record)
    target_rows = []
    for target in targets.values():
        exercises = [{
            **exercise,
            **activity_load_output(
                {key: exercise[key] for key in totals}, reference_scale, has_baseline_period,
            ),
        } for exercise in target['exercises'].values()]
        target_rows.append({
            **target, 'exercises': exercises,
            **activity_load_output(
                {key: target[key] for key in totals}, reference_scale, has_baseline_period,
            ),
            'workout_dates': sorted(target['workout_dates']),
            'exercise_count': sum(exercise['set_count'] > 0 for exercise in exercises),
        })
    target_rows.sort(key=lambda target: (
        -target['volume_kg'], target['target_area'] or '', target['target_subarea'] or '',
    ))
    return {
        'start_date': start_date.isoformat(), 'end_date': end_date.isoformat(),
        'score_method': 'four_week_volume_v1', 'period_type': period_type,
        'baseline_start_date': baseline_start.isoformat() if baseline_day_count else None,
        'baseline_end_date': baseline_end.isoformat() if baseline_day_count else None,
        'baseline_history_complete': baseline_day_count == 28,
        'baseline_day_count': baseline_day_count,
        'baseline_sampling_method': baseline_sampling_method,
        'history_start_date': history_start.isoformat() if history_start else None,
        'period_day_count': period_day_count,
        'baseline_sample_day_count': baseline_sample_day_count,
        **activity_load_output(totals, reference_scale, has_baseline_period),
        'exercise_count': len(exercise_keys),
        'recorded_day_count': len(workout_dates), 'targets': target_rows,
        'unclassified_set_count': unclassified_set_count,
    }


def muscle_activity_comparison(
    database, user_id, start_date, end_date, previous_start, previous_end, period_type='weekly',
):
    rows = activity_rows(
        database, user_id, min(start_date, previous_start) - timedelta(days=28), end_date,
    )
    history_start = database.scalar(
        select(func.min(workoutSession.workout_date))
        .join(workoutSet, workoutSet.session_id == workoutSession.session_id)
        .where(workoutSession.user_id == user_id)
    )
    return {
        'current': activity_summary(rows, start_date, end_date, period_type, history_start),
        'previous': activity_summary(rows, previous_start, previous_end, period_type, history_start),
    }
