"""Accepted timer segments shared by workout records and comparison reports."""

from collections import Counter
from datetime import datetime, time, timedelta, timezone
from math import floor
from zoneinfo import ZoneInfo

from sqlalchemy import select

from .database import workoutTimer, workoutTimerSegment


def workout_time_days(database, user_timezones, date_from, date_to):
    totals_by_user = {user_id: {} for user_id in user_timezones}
    if not user_timezones or date_to < date_from:
        return totals_by_user
    timezones = {user_id: ZoneInfo(name) for user_id, name in user_timezones.items()}
    period_start = min(
        datetime.combine(date_from, time.min, user_timezone).astimezone(timezone.utc)
        for user_timezone in timezones.values()
    ).replace(tzinfo=None)
    period_end = max(
        datetime.combine(date_to + timedelta(days=1), time.min, user_timezone)
        .astimezone(timezone.utc)
        for user_timezone in timezones.values()
    ).replace(tzinfo=None)
    # One projected join for all requested users, rather than a query per timer.
    segments = database.execute(select(
        workoutTimer.user_id, workoutTimer.timer_uuid,
        workoutTimerSegment.segment_started_at, workoutTimerSegment.segment_ended_at,
        workoutTimerSegment.record_source,
    ).join(workoutTimer, workoutTimer.timer_id == workoutTimerSegment.timer_id).where(
        workoutTimer.user_id.in_(user_timezones),
        workoutTimer.status == 'finished',
        workoutTimerSegment.segment_status == 'accepted',
        workoutTimerSegment.record_source.in_(['timer_recorded', 'self_reported']),
        workoutTimerSegment.segment_started_at < period_end,
        workoutTimerSegment.segment_ended_at >= period_start,
    )).all()
    for segment in segments:
        user_timezone = timezones[segment.user_id]
        cursor = segment.segment_started_at.replace(tzinfo=timezone.utc)
        segment_end = segment.segment_ended_at.replace(tzinfo=timezone.utc)
        if segment_end < cursor:
            continue
        # Preserve an explicitly measured zero; it differs from having no timer.
        first_slice = True
        while cursor < segment_end or first_slice:
            first_slice = False
            local_date = cursor.astimezone(user_timezone).date()
            next_local_day = datetime.combine(
                local_date + timedelta(days=1), time.min, user_timezone,
            ).astimezone(timezone.utc)
            slice_end = min(segment_end, next_local_day)
            if date_from <= local_date <= date_to:
                day_entry = totals_by_user[segment.user_id].setdefault(local_date.isoformat(), {
                    'measured_seconds': 0.0, 'timer_recorded_seconds': 0.0,
                    'self_reported_seconds': 0.0, 'timer_ids': set(),
                })
                seconds = (slice_end - cursor).total_seconds()
                day_entry['measured_seconds'] += seconds
                day_entry[f'{segment.record_source}_seconds'] += seconds
                day_entry['timer_ids'].add(segment.timer_uuid)
            cursor = slice_end
    return {
        user_id: {
            workout_date: {
                'workout_date': workout_date,
                'measured_seconds': floor(values['measured_seconds']),
                'timer_recorded_seconds': floor(values['timer_recorded_seconds']),
                'self_reported_seconds': floor(values['self_reported_seconds']),
                'timer_count': len(values['timer_ids']), 'measurement_status': 'measured',
            }
            for workout_date, values in sorted(totals.items())
        }
        for user_id, totals in totals_by_user.items()
    }


def workout_time_totals(days, workout_sets=()):
    measured_days = len(days)
    measured_seconds = sum(day['measured_seconds'] for day in days.values())
    sets_by_date = Counter(item.workout_date.isoformat() for item in workout_sets)
    timed_set_dates = [
        workout_date for workout_date, day in days.items()
        if sets_by_date[workout_date] and day['measured_seconds'] > 0
    ]
    timed_set_count = sum(sets_by_date[workout_date] for workout_date in timed_set_dates)
    timed_set_seconds = sum(days[workout_date]['measured_seconds'] for workout_date in timed_set_dates)
    return {
        'measured_seconds': measured_seconds if measured_days else None,
        'timer_recorded_seconds': sum(day['timer_recorded_seconds'] for day in days.values())
        if measured_days else None,
        'self_reported_seconds': sum(day['self_reported_seconds'] for day in days.values())
        if measured_days else None,
        'measured_days': measured_days,
        'average_seconds': round(measured_seconds / measured_days, 2) if measured_days else None,
        'timer_count': sum(day['timer_count'] for day in days.values()),
        'timed_set_days': len(timed_set_dates), 'timed_set_count': timed_set_count,
        'sets_per_hour': round(timed_set_count * 3600 / timed_set_seconds, 2)
        if timed_set_seconds else None,
        'days': list(days.values()),
    }


def compare_workout_times(previous_days, current_days, previous_sets=(), current_sets=()):
    previous = workout_time_totals(previous_days, previous_sets)
    current = workout_time_totals(current_days, current_sets)
    comparable = previous['measured_days'] > 0 and current['measured_days'] > 0
    total_change = current['measured_seconds'] - previous['measured_seconds'] if comparable else None
    return {
        'previous': previous, 'current': current, 'comparable': comparable,
        'total_seconds_change': total_change,
        'average_seconds_change': round(current['average_seconds'] - previous['average_seconds'], 2)
        if comparable else None,
        'total_change_percent': round(total_change / previous['measured_seconds'] * 100, 1)
        if comparable and previous['measured_seconds'] > 0 else None,
        'sets_per_hour_change': round(current['sets_per_hour'] - previous['sets_per_hour'], 2)
        if previous['sets_per_hour'] is not None and current['sets_per_hour'] is not None else None,
        'direction': 'insufficient_data' if not comparable else 'increased' if total_change > 0
        else 'decreased' if total_change < 0 else 'maintained',
    }
