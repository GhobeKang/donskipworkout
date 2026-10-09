"""Host-only growth evidence, compared with the immediately preceding equal-length window."""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_, select

from .database import (
    challengeCheckin,
    challengeRoundMember,
    challengeRulebook,
    challengeVerificationEvent,
    scheduleDay,
    userAccount,
    weeklyPromise,
    workoutSession,
    workoutSet,
)
from .personal_report import compare_conditions, exercise_key

growth_method_version = 'growth_v2'
growth_weights = {'attendance': 20, 'volume': 50, 'punctuality': 20, 'extra': 10}


def capture_growth_plans(database, current_round, member_ids, now):
    # Save a fixed reference before the round starts; never reconstruct an old plan
    # from today's mutable settings. Kept private in the round's JSON, not its rulebook.
    plans = {str(user_id): {'schedule_days': []} for user_id in member_ids}
    for user_id, day_of_week in database.execute(
        select(scheduleDay.user_id, scheduleDay.day_of_week)
        .where(scheduleDay.user_id.in_(member_ids))
        .order_by(scheduleDay.day_of_week)
    ):
        plans[str(user_id)]['schedule_days'].append(day_of_week)
    for user_id, user_timezone in database.execute(
        select(userAccount.user_id, userAccount.timezone)
        .where(userAccount.user_id.in_(member_ids))
    ):
        plans[str(user_id)]['timezone'] = user_timezone
    current_round.draft_rulebook = {
        **current_round.draft_rulebook,
        '_growth_plans': plans,
        '_growth_plans_captured_at': now.isoformat() + 'Z',
    }



def capped_attendance(dates, start_date, duration_days, target_count):
    periods = []
    for period_index, offset in enumerate(range(0, duration_days, 7), start=1):
        period_start = start_date + timedelta(days=offset)
        completed_count = sum(period_start <= day < period_start + timedelta(days=7) for day in dates)
        periods.append({
            'period_index': period_index, 'start_date': period_start.isoformat(),
            'completed_count': completed_count,
            'credited_count': min(completed_count, target_count) if target_count else 0,
            'target_count': target_count,
        })
    target_days = target_count * len(periods) if target_count else None
    credited_days = sum(item['credited_count'] for item in periods)
    return {
        'periods': periods, 'target_days': target_days, 'credited_days': credited_days,
        'achievement_percent': round(100 * credited_days / target_days, 2) if target_days else None,
    }


def personal_attendance_goal(current_round, account, plan, goal_history):
    if plan is not None and 'schedule_days' in plan:
        return len(plan['schedule_days']), 'start_snapshot'
    local_start = current_round.start_at.replace(tzinfo=timezone.utc).astimezone(
        ZoneInfo(account.timezone or 'Asia/Seoul'),
    ).date()
    start_week = local_start - timedelta(days=local_start.weekday())
    applicable_goals = [
        item for item in goal_history
        if item.effective_week <= start_week and item.baseline_date <= local_start
    ]
    if not applicable_goals:
        return None, 'unknown'
    return applicable_goals[-1].target_count, 'promise_history'


def score_metric(metric_key, previous, current, scoring_value, full_score_value, reason=None, **evidence):
    comparable = scoring_value is not None
    return {
        'key': metric_key,
        'max_points': growth_weights[metric_key],
        'points': round(growth_weights[metric_key] * min(1, max(0, scoring_value) / full_score_value), 1)
        if comparable else None,
        'previous': previous,
        'current': current,
        'change': round(current - previous, 2) if previous is not None and current is not None else None,
        'scoring_value': round(scoring_value, 2) if comparable else None,
        'growth_value': round(scoring_value, 2)
        if comparable and metric_key in {'volume', 'extra'} else None,
        'comparable': comparable,
        'reason': None if comparable else reason or 'insufficient_records',
        **evidence,
    }


def workout_totals(workout_sets):
    days = len({item.workout_date for item in workout_sets})
    return {
        'workout_days': days,
        'set_count': len(workout_sets),
        'sets_per_workout': round(len(workout_sets) / days, 2) if days else None,
        'rep_count': sum(item.reps for item in workout_sets),
        'volume_kg': round(sum(float(item.weight_kg) * item.reps for item in workout_sets), 2),
        'best_weight_kg': max((float(item.weight_kg) for item in workout_sets), default=None),
    }


def workout_logs(workout_sets):
    by_date = defaultdict(list)
    for item in workout_sets:
        by_date[item.workout_date.isoformat()].append({
            'weight_kg': float(item.weight_kg), 'reps': item.reps,
        })
    return [{'date': day, 'sets': sets} for day, sets in sorted(by_date.items())]


def exercise_reports(previous_sets, current_sets):
    previous_by_exercise = defaultdict(list)
    current_by_exercise = defaultdict(list)
    for items, grouped in ((previous_sets, previous_by_exercise), (current_sets, current_by_exercise)):
        for item in items:
            # Deleted exercise identities can be displayed, but cannot be compared by name.
            identity = exercise_key(item) or ('deleted', item.exercise_name)
            grouped[identity].append(item)
    reports = []
    for identity in sorted(previous_by_exercise.keys() | current_by_exercise.keys()):
        previous = previous_by_exercise[identity]
        current = current_by_exercise[identity]
        previous_totals = workout_totals(previous)
        current_totals = workout_totals(current)
        volume_change = (
            (current_totals['volume_kg'] / previous_totals['volume_kg'] - 1) * 100
            if identity[0] != 'deleted' and previous_totals['volume_kg'] > 0 and current else None
        )
        reports.append({
            'exercise_source': identity[0],
            'exercise_id': identity[1] if identity[0] != 'deleted' else None,
            'exercise_name': (current or previous)[-1].exercise_name,
            'previous': previous_totals, 'current': current_totals,
            'volume_change_percent': round(volume_change, 2) if volume_change is not None else None,
            # Matching conditions remain supporting detail, not scoring criteria.
            'conditions': compare_conditions(previous, current) if identity[0] != 'deleted' else [],
            'previous_logs': workout_logs(previous), 'current_logs': workout_logs(current),
        })
    return reports


def punctuality(sessions, user_timezone, attendance_days):
    measured = []
    for session in sessions:
        if not session.certified_at:
            continue
        # Restoring the original schedule prevents snoozing from extending the window.
        original_schedule = datetime.combine(
            session.workout_date, session.scheduled_time, tzinfo=user_timezone,
        ) - timedelta(minutes=30 * session.snooze_count)
        scheduled_at = original_schedule.astimezone(timezone.utc)
        certified_at = session.certified_at.replace(tzinfo=timezone.utc)
        local_completion = certified_at.astimezone(user_timezone)
        elapsed_minutes = (certified_at - scheduled_at).total_seconds() / 60
        on_time = 0 <= elapsed_minutes <= 120
        measured.append({
            'date': session.workout_date.isoformat(),
            'scheduled_time': original_schedule.strftime('%H:%M'),
            'window_start_at': scheduled_at.isoformat().replace('+00:00', 'Z'),
            'deadline_at': (scheduled_at + timedelta(hours=2)).isoformat().replace('+00:00', 'Z'),
            'certified_at': certified_at.isoformat().replace('+00:00', 'Z'),
            'certified_time': local_completion.strftime('%Y-%m-%d %H:%M:%S'),
            'elapsed_minutes': round(elapsed_minutes, 1),
            'on_time': on_time,
            'timing_status': 'within_window' if on_time else 'early' if elapsed_minutes < 0 else 'late',
        })
    on_time_count = sum(item['on_time'] for item in measured)
    return {
        'measured_days': len(measured), 'attendance_days': attendance_days,
        'on_time_days': on_time_count, 'missing_days': max(0, attendance_days - len(measured)),
        'on_time_percent': round(100 * on_time_count / attendance_days, 2) if attendance_days else 0,
        'records': measured,
    }


def extra_workouts(dates, start_date, duration_days, target_count, schedule_days, local_dates):
    weekly_counts = [
        sum(start_date + timedelta(days=offset) <= day < start_date + timedelta(days=offset + 7)
            for day in dates)
        for offset in range(0, duration_days, 7)
    ]
    off_day_dates = (
        [day.isoformat() for day in sorted(local_dates) if (day.weekday() + 1) % 7 not in schedule_days]
        if schedule_days is not None else None
    )
    return {
        'above_target_days': sum(max(0, count - target_count) for count in weekly_counts),
        'off_day_count': len(off_day_dates) if off_day_dates is not None else None,
        'off_day_dates': off_day_dates,
    }


def member_growth_report(
    account, participant_status, previous_sessions, current_sessions, previous_sets, current_sets,
    accepted_dates, rulebook, current_start, previous_start, duration_days, plan, now,
    personal_target_count, goal_source,
):
    previous_dates = {item.evaluation_date for item in previous_sessions}
    current_dates = set(accepted_dates)
    # Only accepted round workouts contribute to this report's current exercise evidence.
    exercises = exercise_reports(previous_sets, current_sets)
    previous_totals = workout_totals(previous_sets)
    current_totals = workout_totals(current_sets)
    previous_attendance = capped_attendance(
        previous_dates, previous_start, duration_days, personal_target_count,
    )
    current_attendance = capped_attendance(
        current_dates, current_start, duration_days, personal_target_count,
    )
    volume_known = (
        min(previous_totals['workout_days'], current_totals['workout_days']) >= 2
        and previous_totals['volume_kg'] > 0
    )
    volume_change = (
        (current_totals['volume_kg'] / previous_totals['volume_kg'] - 1) * 100
        if volume_known else None
    )
    attendance_known = personal_target_count is not None and personal_target_count > 0
    user_timezone = ZoneInfo((plan or {}).get('timezone') or account.timezone or 'Asia/Seoul')
    previous_punctuality = punctuality(previous_sessions, user_timezone, len(previous_dates))
    current_punctuality = punctuality(current_sessions, user_timezone, len(current_dates))
    punctuality_known = not current_dates or current_punctuality['measured_days'] > 0
    schedule_days = plan.get('schedule_days') if plan else None
    previous_extra = extra_workouts(
        previous_dates, previous_start, duration_days, rulebook.target_count, schedule_days,
        {item.workout_date for item in previous_sessions},
    )
    current_extra = extra_workouts(
        current_dates, current_start, duration_days, rulebook.target_count, schedule_days,
        {item.workout_date for item in current_sessions},
    )
    extra_source = 'off_days' if schedule_days is not None else 'above_target'
    extra_field = 'off_day_count' if extra_source == 'off_days' else 'above_target_days'
    extra_change = current_extra[extra_field] - previous_extra[extra_field]
    metrics = [
        score_metric(
            'attendance', previous_attendance['achievement_percent'],
            current_attendance['achievement_percent'],
            current_attendance['achievement_percent'] if attendance_known else None, 100,
            reason='personal_goal_unavailable',
            previous_days=len(previous_dates), current_days=len(current_dates),
            target_count_per_week=personal_target_count,
            target_days=current_attendance['target_days'],
            credited_days=current_attendance['credited_days'], goal_source=goal_source,
        ),
        score_metric(
            'volume', previous_totals['volume_kg'], current_totals['volume_kg'],
            volume_change, 20, reason='volume_baseline_unavailable',
            previous_recorded_days=previous_totals['workout_days'],
            current_recorded_days=current_totals['workout_days'],
        ),
        score_metric(
            'punctuality', previous_punctuality['on_time_percent'] if previous_dates else None,
            current_punctuality['on_time_percent'],
            current_punctuality['on_time_percent'] if punctuality_known else None, 100,
            reason='certification_time_unavailable',
            current_measured_days=current_punctuality['measured_days'],
            current_attendance_days=len(current_dates),
            current_on_time_days=current_punctuality['on_time_days'],
            missing_days=current_punctuality['missing_days'],
        ),
        score_metric(
            'extra', previous_extra[extra_field], current_extra[extra_field],
            extra_change / (duration_days / 7) if len(previous_dates) >= 2 else None, 1,
            source=extra_source,
        ),
    ]
    available_points = sum(item['max_points'] for item in metrics if item['comparable'])
    earned_points = round(sum(item['points'] or 0 for item in metrics), 1)
    score_status = 'scored' if available_points >= 50 else 'insufficient_records'
    return {
        'method_version': growth_method_version,
        'user_uuid': account.user_uuid, 'display_name': account.display_name or '참가자',
        'participant_status': participant_status, 'score_status': score_status,
        'total_score': earned_points if score_status == 'scored' else None,
        'earned_points': earned_points, 'available_points': available_points,
        'computed_at': now.isoformat() + 'Z',
        'current_period': {
            'start_date': current_start.isoformat(),
            'end_date': (current_start + timedelta(days=duration_days - 1)).isoformat(),
        },
        'previous_period': {
            'start_date': previous_start.isoformat(),
            'end_date': (current_start - timedelta(days=1)).isoformat(),
        },
        'metrics': metrics, 'exercises': exercises,
        'attendance': {
            'previous_dates': [day.isoformat() for day in sorted(previous_dates)],
            'current_dates': [day.isoformat() for day in sorted(current_dates)],
            'target_count_per_week': personal_target_count,
            'target_days': current_attendance['target_days'],
            'credited_days': current_attendance['credited_days'],
            'goal_source': goal_source,
            'periods': current_attendance['periods'],
            'previous_periods': previous_attendance['periods'],
        },
        'punctuality': {'previous': previous_punctuality, 'current': current_punctuality},
        'extra': {
            'previous': previous_extra, 'current': current_extra,
            'source': extra_source, 'reference_schedule_days': schedule_days,
        },
        'previous_totals': previous_totals, 'current_totals': current_totals,
        'improved_exercise_count': sum(
            (item['volume_change_percent'] or 0) > 0
            for item in exercises
        ),
    }


def build_round_growth_reports(database, current_round, now):
    rulebook = database.scalar(select(challengeRulebook).where(
        challengeRulebook.round_id == current_round.round_id,
        challengeRulebook.version == current_round.rulebook_version,
    ))
    if rulebook is None or not current_round.start_at or not current_round.end_at:
        return {}
    member_rows = database.execute(
        select(
            challengeRoundMember.user_id, challengeRoundMember.participant_status,
            userAccount.user_uuid, userAccount.display_name, userAccount.timezone,
        )
        .join(userAccount, userAccount.user_id == challengeRoundMember.user_id)
        .where(
            challengeRoundMember.round_id == current_round.round_id,
            challengeRoundMember.participant_status.not_in(['invited', 'joined_pending']),
            challengeRoundMember.consented_at.is_not(None),
        )
        .order_by(challengeRoundMember.joined_at, challengeRoundMember.member_id)
    ).all()
    members = [(
        item.user_id, item.participant_status,
        SimpleNamespace(user_uuid=item.user_uuid, display_name=item.display_name, timezone=item.timezone),
    ) for item in member_rows]
    member_ids = [item[0] for item in members]
    if not member_ids:
        return {}
    round_timezone = ZoneInfo(current_round.timezone)
    current_start = current_round.start_at.replace(tzinfo=timezone.utc).astimezone(round_timezone).date()
    duration_days = (current_round.end_at - current_round.start_at).days
    previous_start = current_start - timedelta(days=duration_days)
    current_end = current_start + timedelta(days=duration_days)
    accepted_by_member = defaultdict(set)
    accepted_sessions = {}
    for user_id, session_id, evaluation_date, accepted_at in database.execute(select(
        challengeCheckin.user_id, challengeVerificationEvent.session_id,
        challengeCheckin.evaluation_date, challengeVerificationEvent.accepted_at,
    ).join(
        challengeVerificationEvent,
        challengeVerificationEvent.event_id == challengeCheckin.verification_event_id,
    ).where(
        challengeCheckin.round_id == current_round.round_id,
        challengeCheckin.status == 'accepted',
        challengeVerificationEvent.status == 'accepted',
        challengeCheckin.user_id.in_(member_ids),
        challengeCheckin.evaluation_date >= current_start,
        challengeCheckin.evaluation_date < current_end,
    )):
        accepted_by_member[user_id].add(evaluation_date)
        accepted_sessions[session_id] = {'evaluation_date': evaluation_date, 'certified_at': accepted_at}
    previous_start_at = current_round.start_at - timedelta(days=duration_days)
    baseline_filter = and_(
        workoutSession.completed_at >= previous_start_at,
        workoutSession.completed_at < current_round.start_at,
        workoutSession.verification_type == 'photo' if rulebook.verification_mode == 'photo_required'
        else workoutSession.verification_type.in_(['photo', 'manual']),
    )
    # Join accepted events by session ID, not by date. A member's local workout
    # date can differ from the round's Seoul evaluation date.
    # Projection also prevents loading private notes/photos via relationships.
    session_rows = database.execute(select(
        workoutSession.session_id, workoutSession.user_id, workoutSession.workout_date,
        workoutSession.scheduled_time, workoutSession.snooze_count,
        workoutSession.completed_at,
    ).where(
        workoutSession.user_id.in_(member_ids), workoutSession.session_status == 'completed',
        or_(baseline_filter, workoutSession.session_id.in_(accepted_sessions)),
    ).order_by(workoutSession.workout_date)).all()
    sessions = [
        SimpleNamespace(**item._mapping, evaluation_date=(
            accepted_sessions[item.session_id]['evaluation_date'] if item.session_id in accepted_sessions
            else item.completed_at.replace(tzinfo=timezone.utc).astimezone(round_timezone).date()
        ), certified_at=(
            accepted_sessions[item.session_id]['certified_at'] if item.session_id in accepted_sessions
            else item.completed_at
        ))
        for item in session_rows
    ]
    sets = database.execute(select(
        workoutSession.session_id, workoutSession.user_id, workoutSession.workout_date,
        workoutSet.exercise_source, workoutSet.exercise_id, workoutSet.shared_exercise_id,
        workoutSet.exercise_name, workoutSet.weight_kg, workoutSet.reps,
    ).join(workoutSession, workoutSession.session_id == workoutSet.session_id).where(
        workoutSession.session_id.in_([item.session_id for item in sessions]),
    ).order_by(workoutSession.workout_date, workoutSet.exercise_order, workoutSet.set_order)).all()
    sessions_by_member = defaultdict(list)
    sets_by_member = defaultdict(list)
    for item in sessions:
        sessions_by_member[item.user_id].append(item)
    for item in sets:
        sets_by_member[item.user_id].append(item)
    goals_by_member = defaultdict(list)
    for goal in database.execute(select(
        weeklyPromise.user_id, weeklyPromise.effective_week,
        weeklyPromise.baseline_date, weeklyPromise.target_count,
    ).where(
        weeklyPromise.user_id.in_(member_ids), weeklyPromise.effective_week <= current_start,
    ).order_by(weeklyPromise.effective_week)):
        goals_by_member[goal.user_id].append(goal)
    plans = (current_round.draft_rulebook or {}).get('_growth_plans', {})
    return {
        str(user_id): member_growth_report(
            account, participant_status,
            [item for item in sessions_by_member[user_id] if item.session_id not in accepted_sessions],
            [item for item in sessions_by_member[user_id] if item.session_id in accepted_sessions],
            [item for item in sets_by_member[user_id] if item.session_id not in accepted_sessions],
            [item for item in sets_by_member[user_id] if item.session_id in accepted_sessions],
            accepted_by_member[user_id], rulebook, current_start, previous_start,
            duration_days, plans.get(str(user_id)), now,
            *personal_attendance_goal(
                current_round, account, plans.get(str(user_id)), goals_by_member[user_id],
            ),
        )
        for user_id, participant_status, account in members
    }
