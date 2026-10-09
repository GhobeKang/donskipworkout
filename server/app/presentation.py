import calendar
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from .database import attendanceSetting, scheduleDay, userAccount, workoutSession
from .sharing import promise_for_week
from .workouts import workout_groups_output

day_names = ['일', '월', '화', '수', '목', '금', '토']
hero_quotes = {
    'off': '오늘은 계획대로만\n가면 됩니다.',
    'spicy': '핑계는 준비됐고,\n이제 몸만 가면 됩니다.',
    'hot': '또 미루면,\n오늘도 운동은 구경입니다.',
}
progress_messages = {
    'off': {
        'scheduled': '오늘은 계획대로 천천히 시작해요.',
        'started': '좋아요. 오늘 운동을 이어가고 있어요.',
        'completed': '오늘 운동 약속을 지켰어요.',
        'rest': '오늘은 회복하는 날이에요.',
        'missed': '괜찮아요. 내일 다시 시작해요.',
        'free': '오늘은 가볍게 움직여요.',
    },
    'spicy': {
        'scheduled': '오늘 약속 잊지 않았지? 갈 거라 믿어.',
        'started': '좋아! 오늘도 성장하러 가보자고!',
        'completed': '갔다가 오니 별거 아니지? 오늘도 성장했네!',
        'rest': '쉴 땐 제대로 쉬고 다시 와. 다시 와서 성장할 수 있도록 귀찮게 해줄게.',
        'missed': '뭐 한다고 약속도 안지키냐. 내일도 그럴거면 그냥 때려치던가.',
        'free': '예정된 운동 약속은 없어. 컨디션 보고 가자.',
    },
    'hot': {
        'scheduled': '운동 한다고 니가 선택했잖아. 일단 가자.',
        'started': '도착했으면 눈에 보이는거 뭐라도 한 세트 해봐. 마음이 달라질거야.',
        'completed': '해놓고 보니 별거 아니지? 내일도 그렇게 하면 되는거야.',
        'rest': '진짜 회복이면 제대로 쉬어. 도망치는 거면... 이미 너도 알고 있잖아?',
        'missed': '그거 뭐 몇 시간 한다고 약속도 안지키나. 그런 정신상태로 성장할 생각은 바라지도 마라.',
        'free': '성장 하고 싶으면 가고, 그냥 그대로 있고 있으면 집에 있던가.',
    },
}
roast_quotes = {
    'off': '운동 시간을 확인하세요. 오늘 일정이 있습니다.',
    'spicy': '오늘 약속 잊지 않았지? 갈 거라 믿어.',
    'hot': '운동 한다고 니가 선택했잖아. 일단 가자.',
}
roast_labels = {'off': '끄기', 'spicy': '매운맛', 'hot': '아주 매운맛'}
status_labels = {
    'scheduled': '예정',
    'started': '출발',
    'completed': '출석 완료',
    'rest': '휴식',
    'missed': '미실행',
}


def local_today(timezone_name='Asia/Seoul'):
    return local_now(timezone_name).date()


def local_now(timezone_name='Asia/Seoul'):
    return datetime.now(ZoneInfo(timezone_name))


def settings_output(database, user_id):
    settings = database.get(attendanceSetting, user_id)
    account = database.get(userAccount, user_id)
    if settings is None:
        raise RuntimeError('Missing attendance settings')
    if account is None:
        raise RuntimeError('Missing user account')
    days = database.scalars(
        select(scheduleDay.day_of_week)
        .where(
            scheduleDay.user_id == user_id,
        )
        .order_by(scheduleDay.day_of_week)
    ).all()
    roast_level = 'off' if settings.roast_level == 'mild' else settings.roast_level
    return {
        'country_code': account.country_code,
        'timezone': account.timezone,
        'schedule_days': list(days),
        'workout_time': settings.workout_time.strftime('%H:%M'),
        'roast_level': roast_level,
        'reuse_enabled': settings.reuse_enabled,
        'notification_workout_enabled': settings.notification_workout_enabled,
        'notification_free_workout_enabled': settings.notification_free_workout_enabled,
        'notification_missed_enabled': settings.notification_missed_enabled,
        'notification_snooze_enabled': settings.notification_snooze_enabled,
    }


def effective_status(session, today):
    if session.workout_date < today and session.session_status in {'scheduled', 'started'}:
        return 'missed'
    return session.session_status


def progress_message_for(roast_level, current_session, is_scheduled_day):
    progress_status = (
        current_session.session_status
        if current_session
        else 'scheduled'
        if is_scheduled_day
        else 'free'
    )
    level_messages = progress_messages.get(roast_level, progress_messages['off'])
    return level_messages.get(progress_status, hero_quotes.get(roast_level, hero_quotes['off']))


def session_output(session, today):
    status = effective_status(session, today)
    return {
        'session_uuid': session.session_uuid,
        'workout_date': session.workout_date.isoformat(),
        'date': f'{session.workout_date.month}월 {session.workout_date.day}일',
        'title': session.note
        if status == 'completed' and session.note
        else {
            'completed': '운동 출석',
            'rest': '의도한 휴식',
            'missed': '미실행',
            'scheduled': '운동 예정',
            'started': '운동 출발',
        }[status],
        'status': status_labels[status],
        'session_status': status,
        'scheduled_time': session.scheduled_time.strftime('%H:%M'),
        'snooze_count': session.snooze_count,
        'note': session.note,
        'verification_type': session.verification_type,
        'photo_path': f'/sessions/{session.session_uuid}/photo'
        if any(photo.photo_uuid for photo in session.photos)
        else None,
        'reusable': session.reusable,
        'started_at': session.started_at.isoformat(timespec='milliseconds') + 'Z'
        if session.started_at
        else None,
        'completed_at': session.completed_at.isoformat(timespec='milliseconds') + 'Z'
        if session.completed_at
        else None,
        'exercise_groups': workout_groups_output(session.workout_sets),
    }


def scheduled_missed_dates(schedule_days, start_date, end_date, recorded_dates):
    missed_dates = set()
    recorded_date_set = set(recorded_dates)
    scheduled_day_set = set(schedule_days)
    current_date = start_date
    while current_date < end_date:
        weekday = (current_date.weekday() + 1) % 7
        if weekday in scheduled_day_set and current_date not in recorded_date_set:
            missed_dates.add(current_date)
        current_date += timedelta(days=1)
    return missed_dates


def calendar_output(sessions, year, month, today, schedule_days=(), account_created_date=None):
    statuses = {session.workout_date.day: effective_status(session, today) for session in sessions}
    month_start = datetime(year, month, 1).date()
    month_end = datetime(year + (month == 12), month % 12 + 1, 1).date()
    if account_created_date:
        missed_start = max(month_start, account_created_date)
        for missed_date in scheduled_missed_dates(
            schedule_days,
            missed_start,
            min(month_end, today),
            (session.workout_date for session in sessions),
        ):
            statuses[missed_date.day] = 'missed'
    return {
        'year': year,
        'month': month,
        'days': list(range(1, calendar.monthrange(year, month)[1] + 1)),
        'first_day_of_week': (calendar.monthrange(year, month)[0] + 1) % 7,
        'completed_days': sorted(day for day, status in statuses.items() if status == 'completed'),
        'rest_days': sorted(day for day, status in statuses.items() if status == 'rest'),
        'missed_days': sorted(day for day, status in statuses.items() if status == 'missed'),
        'day_statuses': statuses,
    }


def today_output(database, user_id):
    settings = settings_output(database, user_id)
    today = local_today(settings['timezone'])
    week_start = today - timedelta(days=today.weekday())
    sessions = database.scalars(
        select(workoutSession).where(
            workoutSession.user_id == user_id,
            workoutSession.workout_date >= week_start,
            workoutSession.workout_date < week_start + timedelta(days=7),
        )
    ).all()
    current_session = next((session for session in sessions if session.workout_date == today), None)
    completed_count = sum(session.session_status == 'completed' for session in sessions)
    weekly_promise = promise_for_week(database, user_id, week_start)
    target_count = weekly_promise.target_count if weekly_promise else len(settings['schedule_days'])
    is_scheduled_day = (today.weekday() + 1) % 7 in settings['schedule_days']
    memory = None
    if settings['reuse_enabled']:
        memory_session = database.scalar(
            select(workoutSession)
            .where(
                workoutSession.user_id == user_id,
                workoutSession.session_status == 'completed',
                workoutSession.reusable.is_(True),
                workoutSession.workout_date < today,
            )
            .order_by(workoutSession.workout_date.desc())
            .limit(1)
        )
        if memory_session:
            memory = session_output(memory_session, today)
    return {
        'workout_date': today.isoformat(),
        'timezone': settings['timezone'],
        'workout_time': current_session.scheduled_time.strftime('%H:%M')
        if current_session
        else settings['workout_time'],
        'hero_quote': hero_quotes[settings['roast_level']],
        'progress_message': progress_message_for(
            settings['roast_level'], current_session, is_scheduled_day
        ),
        'is_scheduled_day': is_scheduled_day,
        'session': session_output(current_session, today) if current_session else None,
        'weekly_attendance': {
            'completed_count': completed_count,
            'target_count': target_count,
            'progress_percent': min(100, round(completed_count / target_count * 100))
            if target_count
            else 0,
            'remaining_count': max(0, target_count - completed_count),
        },
        'memory': memory,
    }
