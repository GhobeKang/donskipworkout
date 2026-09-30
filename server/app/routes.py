from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query, Request, Response
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError

from .database import (
    attendanceSetting,
    authSession,
    scheduleDay,
    userAccount,
    userCredential,
    weeklyPromise,
    workoutSession,
)
from .notification_catalog import notificationCatalog, read_notification_catalog
from .presentation import (
    calendar_output,
    day_names,
    local_now,
    local_today,
    roast_labels,
    roast_quotes,
    scheduled_missed_dates,
    session_output,
    settings_output,
    today_output,
)
from .schemas import (
    authenticationData,
    loginRequest,
    recordsData,
    registerRequest,
    sessionAction,
    sessionData,
    settingsData,
    settingsOptions,
    statsData,
    todayData,
    userData,
    weeklyShareData,
    workoutGroupsInput,
    workoutLogData,
)
from .security import (
    authentication_data,
    authentication_error,
    clear_session_cookie,
    create_session,
    current_session_dependency,
    databaseDependency,
    dummy_password_hash,
    password_hasher,
    set_session_cookie,
    userDependency,
    utc_now,
)
from .sharing import monday_of, schedule_next_promise, weekly_share_output
from .workouts import replace_workout_groups, workout_groups_output

router = APIRouter(prefix='/api/v1')


@router.post('/auth/register', response_model=authenticationData, status_code=201)
def register(
    payload: registerRequest,
    request: Request,
    response: Response,
    database: databaseDependency,
):
    password_hash = password_hasher.hash(payload.password.get_secret_value())
    user = userAccount(
        user_uuid=str(uuid4()), email=payload.email, display_name=payload.display_name
    )
    try:
        database.add(user)
        database.flush()
        credential = userCredential(user_id=user.user_id, password_hash=password_hash)
        database.add(credential)
        database.add(attendanceSetting(user_id=user.user_id))
        database.add_all(scheduleDay(user_id=user.user_id, day_of_week=day) for day in [1, 3, 5])
        today = local_today()
        database.add(weeklyPromise(user_id=user.user_id, effective_week=monday_of(today),
                                   target_count=3, baseline_date=today))
        database.commit()
    except IntegrityError:
        database.rollback()
        raise HTTPException(409, '계정을 생성할 수 없습니다.') from None
    raw_session_id, expires_in = create_session(request, database, user)
    set_session_cookie(response, request, raw_session_id, expires_in)
    return authentication_data(user, expires_in)


@router.post('/auth/login', response_model=authenticationData)
def login(
    payload: loginRequest,
    request: Request,
    response: Response,
    database: databaseDependency,
):
    user = database.scalar(select(userAccount).where(userAccount.email == payload.email))
    credential = database.get(userCredential, user.user_id) if user else None
    valid_password = password_hasher.verify(
        payload.password.get_secret_value(),
        credential.password_hash if credential else dummy_password_hash,
    )
    if not credential or not valid_password or not credential.is_active:
        raise authentication_error()
    raw_session_id, expires_in = create_session(request, database, user)
    set_session_cookie(response, request, raw_session_id, expires_in)
    return authentication_data(user, expires_in)


@router.get('/auth/session', response_model=authenticationData)
def restore_session(session_data: current_session_dependency):
    stored_session, user = session_data
    expires_in = max(0, int((stored_session.expires_at - utc_now()).total_seconds()))
    return authentication_data(user, expires_in)


@router.post('/auth/logout', status_code=204)
def logout(
    user: userDependency,
    request: Request,
    response: Response,
    database: databaseDependency,
):
    # Remove every server-side session for this user, including other devices.
    database.execute(delete(authSession).where(authSession.user_id == user.user_id))
    database.commit()
    clear_session_cookie(response, request)
    response.status_code = 204
    return response


@router.get('/me', response_model=userData)
def me(user: userDependency):
    return {'user_uuid': user.user_uuid, 'email': user.email, 'display_name': user.display_name}


@router.get('/settings', response_model=settingsData)
def read_settings(user: userDependency, database: databaseDependency):
    return settings_output(database, user.user_id)


@router.put('/settings', response_model=settingsData)
def replace_settings(payload: settingsData, user: userDependency, database: databaseDependency):
    # Shared per-user lock serializes settings changes and daily actions.
    database.scalar(
        select(userAccount).where(userAccount.user_id == user.user_id).with_for_update()
    )
    values = payload.model_dump(exclude={'schedule_days'})
    schedule_next_promise(database, user.user_id, len(payload.schedule_days), local_today())
    values['workout_time'] = time.fromisoformat(payload.workout_time)
    database.execute(
        update(attendanceSetting).where(attendanceSetting.user_id == user.user_id).values(**values)
    )
    database.execute(delete(scheduleDay).where(scheduleDay.user_id == user.user_id))
    database.add_all(
        scheduleDay(user_id=user.user_id, day_of_week=day) for day in payload.schedule_days
    )
    database.commit()
    return settings_output(database, user.user_id)


@router.get('/settings/options', response_model=settingsOptions)
def settings_options(user: userDependency):
    return {'day_names': day_names, 'roast_labels': roast_labels, 'roast_quotes': roast_quotes}


@router.get('/notifications/catalog', response_model=notificationCatalog)
def notification_catalog(request: Request, response: Response, user: userDependency):
    response.headers['Cache-Control'] = 'no-store'
    return read_notification_catalog(request.app.state.settings.notification_catalog_path)


@router.get('/today', response_model=todayData)
def read_today(user: userDependency, database: databaseDependency):
    return today_output(database, user.user_id)


@router.post('/sessions/today/actions', response_model=sessionData)
def act_today(payload: sessionAction, user: userDependency, database: databaseDependency):
    today = local_today()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    database.scalar(
        select(userAccount).where(userAccount.user_id == user.user_id).with_for_update()
    )
    settings = settings_output(database, user.user_id)
    session = database.scalar(
        select(workoutSession)
        .where(
            workoutSession.user_id == user.user_id,
            workoutSession.workout_date == today,
        )
        .with_for_update()
    )
    if session is None:
        if (
            payload.action in {'go', 'snooze'}
            and (today.weekday() + 1) % 7 not in settings['schedule_days']
        ):
            raise HTTPException(409, '오늘은 예정된 운동이 없습니다.')
        session = workoutSession(
            session_uuid=str(uuid4()),
            user_id=user.user_id,
            workout_date=today,
            scheduled_time=time.fromisoformat(settings['workout_time']),
            session_status='scheduled',
            snooze_count=0,
            reusable=settings['reuse_enabled'],
        )
        database.add(session)
    if session.session_status in {'completed', 'rest', 'missed'}:
        if (payload.action == 'manual' and session.session_status == 'completed') or (
            payload.action == 'rest' and session.session_status == 'rest'
        ):
            return session_output(session, today)
        raise HTTPException(409, '이미 종료된 운동입니다.')
    if (
        payload.action == 'snooze'
        and session.session_status == 'scheduled'
        and local_now().time() >= session.scheduled_time
    ):
        raise HTTPException(409, '운동 시간이 지나 미루기를 사용할 수 없습니다.')
    if payload.action == 'go':
        session.session_status = 'started'
        session.started_at = session.started_at or now
    elif payload.action == 'snooze':
        if session.session_status != 'scheduled' or session.snooze_count >= 1:
            raise HTTPException(409, '미루기는 출발 전 하루 한 번만 가능합니다.')
        delayed_time = datetime.combine(today, session.scheduled_time) + timedelta(minutes=30)
        if delayed_time.date() != today:
            raise HTTPException(409, '자정을 넘기는 미루기는 지원하지 않습니다.')
        session.scheduled_time = delayed_time.time()
        session.snooze_count = 1
    elif payload.action == 'rest':
        session.session_status = 'rest'
    else:
        session.session_status = 'completed'
        session.verification_type = 'manual'
        session.completed_at = now
        session.reusable = settings['reuse_enabled']
    if payload.note is not None:
        session.note = payload.note
    database.commit()
    return session_output(session, today)


@router.get('/sessions/by-date/{workout_date}/sets', response_model=workoutLogData)
def read_workout_log(workout_date: date, user: userDependency, database: databaseDependency):
    session = database.scalar(
        select(workoutSession).where(
            workoutSession.user_id == user.user_id,
            workoutSession.workout_date == workout_date,
        )
    )
    return {
        'workout_date': workout_date.isoformat(),
        'exercise_groups': workout_groups_output(session.workout_sets) if session else [],
    }


@router.put('/sessions/by-date/{workout_date}/sets', response_model=workoutLogData)
def save_workout_log(
    workout_date: date,
    payload: workoutGroupsInput,
    user: userDependency,
    database: databaseDependency,
):
    today = local_today()
    if workout_date > today:
        raise HTTPException(422, '미래 날짜에는 운동 세트를 기록할 수 없습니다.')

    database.scalar(
        select(userAccount).where(userAccount.user_id == user.user_id).with_for_update()
    )
    session = database.scalar(
        select(workoutSession)
        .where(
            workoutSession.user_id == user.user_id,
            workoutSession.workout_date == workout_date,
        )
        .with_for_update()
    )
    if session is None:
        settings = settings_output(database, user.user_id)
        session = workoutSession(
            session_uuid=str(uuid4()),
            user_id=user.user_id,
            workout_date=workout_date,
            scheduled_time=time.fromisoformat(settings['workout_time']),
            session_status='scheduled',
            snooze_count=0,
            reusable=settings['reuse_enabled'],
        )
        database.add(session)
        database.flush()

    replace_workout_groups(database, user.user_id, session, payload.exercise_groups)
    if (
        not payload.exercise_groups
        and session.session_status == 'scheduled'
        and session.verification_type is None
        and session.started_at is None
        and session.note is None
        and session.snooze_count == 0
        and not session.photos
        and not session.workout_sets
    ):
        database.delete(session)
    database.commit()
    return {
        'workout_date': workout_date.isoformat(),
        'exercise_groups': workout_groups_output(session.workout_sets),
    }


@router.get('/records', response_model=recordsData)
def records(
    user: userDependency,
    database: databaseDependency,
    year: int = Query(ge=2000, le=2100),
    month: int = Query(ge=1, le=12),
    offset: int = Query(default=0, ge=0, le=10000),
    limit: int = Query(default=20, ge=1, le=100),
):
    first_date = date(year, month, 1)
    next_date = date(year + (month == 12), month % 12 + 1, 1)
    conditions = (
        workoutSession.user_id == user.user_id,
        workoutSession.workout_date >= first_date,
        workoutSession.workout_date < next_date,
    )
    sessions = database.scalars(
        select(workoutSession).where(*conditions).order_by(workoutSession.workout_date.desc())
    ).all()
    today = local_today()
    scheduled_days = database.scalars(
        select(scheduleDay.day_of_week).where(scheduleDay.user_id == user.user_id)
    ).all()
    account = database.get(userAccount, user.user_id)
    account_created_date = account.created_at.date() if account else today
    return {
        'calendar': calendar_output(
            sessions, year, month, today, scheduled_days, account_created_date
        ),
        'records': [
            session_output(session, today) for session in sessions[offset : offset + limit]
        ],
        'pagination': {
            'offset': offset,
            'limit': limit,
            'total': len(sessions),
            'has_more': offset + limit < len(sessions),
        },
    }


@router.get('/sessions/{session_uuid}', response_model=sessionData)
def read_session(session_uuid: UUID, user: userDependency, database: databaseDependency):
    session = database.scalar(
        select(workoutSession).where(
            workoutSession.session_uuid == str(session_uuid),
            workoutSession.user_id == user.user_id,
        )
    )
    if session is None:
        raise HTTPException(404, '기록을 찾을 수 없습니다.')
    return session_output(session, local_today())


@router.get('/stats', response_model=statsData)
def stats(user: userDependency, database: databaseDependency):
    today = local_today()
    account = database.get(userAccount, user.user_id)
    account_created_date = account.created_at.date() if account else today
    scheduled_days = database.scalars(
        select(scheduleDay.day_of_week).where(scheduleDay.user_id == user.user_id)
    ).all()
    recorded_dates = database.scalars(
        select(workoutSession.workout_date).where(
            workoutSession.user_id == user.user_id,
            workoutSession.workout_date >= account_created_date,
            workoutSession.workout_date < today,
        )
    ).all()
    unrecorded_missed_count = len(
        scheduled_missed_dates(scheduled_days, account_created_date, today, recorded_dates)
    )
    status_counts = dict(
        database.execute(
            select(workoutSession.session_status, func.count())
            .where(
                workoutSession.user_id == user.user_id,
            )
            .group_by(workoutSession.session_status)
        ).all()
    )
    overdue_count = database.scalar(
        select(func.count())
        .select_from(workoutSession)
        .where(
            workoutSession.user_id == user.user_id,
            workoutSession.workout_date < today,
            workoutSession.session_status.in_(['scheduled', 'started']),
        )
    )
    return {
        'completed_count': status_counts.get('completed', 0),
        'rest_count': status_counts.get('rest', 0),
        'missed_count': status_counts.get('missed', 0) + overdue_count + unrecorded_missed_count,
        'pending_count': status_counts.get('scheduled', 0)
        + status_counts.get('started', 0)
        - overdue_count,
        'total_count': sum(status_counts.values()) + unrecorded_missed_count,
    }


@router.get('/sharing/weekly', response_model=weeklyShareData)
def weekly_share(
    user: userDependency, database: databaseDependency, response: Response,
    week_offset: int = Query(default=0, ge=0, le=52),
):
    response.headers['Cache-Control'] = 'no-store'
    return weekly_share_output(database, user.user_id, local_today(), week_offset)
