from datetime import date, datetime, time, timedelta, timezone
from math import floor
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from .database import (
    userAccount,
    workoutTimer,
    workoutTimerEvent,
    workoutTimerRevision,
    workoutTimerSegment,
)
from .schemas import (
    workoutTimerAction,
    workoutTimerCorrection,
    workoutTimerReconcile,
    workoutTimerStart,
)
from .security import databaseDependency, userDependency, utc_now

router = APIRouter(prefix='/api/v1')
maximum_running_seconds = 6 * 60 * 60


def segment_seconds(database, timer_id: int, include_open_until: datetime | None = None) -> int:
    segments = database.scalars(
        select(workoutTimerSegment).where(
            workoutTimerSegment.timer_id == timer_id,
            workoutTimerSegment.segment_status.in_(['accepted', 'needs_review']),
        )
    ).all()
    measured_total = 0.0
    for segment in segments:
        segment_end = segment.segment_ended_at or include_open_until
        if segment_end is not None and segment_end >= segment.segment_started_at:
            measured_total += (segment_end - segment.segment_started_at).total_seconds()
    return floor(measured_total)


def timer_output(database, timer: workoutTimer, now: datetime | None = None):
    now = now or utc_now()
    open_segment = database.scalar(
        select(workoutTimerSegment).where(
            workoutTimerSegment.timer_id == timer.timer_id,
            workoutTimerSegment.segment_ended_at.is_(None),
        ).order_by(workoutTimerSegment.segment_id.desc()).limit(1)
    )
    return {
        'timer_uuid': timer.timer_uuid,
        'status': timer.status,
        'started_at': timer.started_at.isoformat() + 'Z',
        'finished_at': timer.finished_at.isoformat() + 'Z' if timer.finished_at else None,
        'measured_seconds': timer.measured_seconds,
        'record_source': timer.record_source,
        'revision': timer.revision,
        'needs_review_reason': timer.needs_review_reason,
        'active_segment_started_at': open_segment.segment_started_at.isoformat() + 'Z'
        if open_segment else None,
        'server_now': now.isoformat() + 'Z',
    }


def find_owned_timer(database, timer_uuid: str, user_id: int, lock: bool = False):
    statement = select(workoutTimer).where(
        workoutTimer.timer_uuid == timer_uuid,
        workoutTimer.user_id == user_id,
    )
    if lock:
        statement = statement.with_for_update()
    timer = database.scalar(statement)
    if timer is None:
        raise HTTPException(404, '운동 시간 기록을 찾을 수 없습니다.')
    return timer


def lock_user(database, user_id: int):
    database.scalar(select(userAccount).where(userAccount.user_id == user_id).with_for_update())


def add_timer_event(
    database,
    timer: workoutTimer,
    request_id: str,
    action: str,
    expected_revision: int,
    now: datetime,
    client_action_at: datetime | None = None,
):
    database.add(
        workoutTimerEvent(
            timer_id=timer.timer_id,
            request_id=request_id,
            action=action,
            server_received_at=now,
            client_action_at=client_action_at,
            expected_revision=expected_revision,
            resulting_revision=timer.revision,
        )
    )


def previous_request(database, timer_id: int, request_id: str):
    return database.scalar(
        select(workoutTimerEvent).where(
            workoutTimerEvent.timer_id == timer_id,
            workoutTimerEvent.request_id == request_id,
        )
    )


def close_open_segment(database, timer: workoutTimer, ended_at: datetime, source: str):
    segment = database.scalar(
        select(workoutTimerSegment)
        .where(
            workoutTimerSegment.timer_id == timer.timer_id,
            workoutTimerSegment.segment_ended_at.is_(None),
        )
        .order_by(workoutTimerSegment.segment_id.desc())
        .limit(1)
        .with_for_update()
    )
    if segment is None:
        raise HTTPException(409, '진행 중인 운동 시간 구간을 찾을 수 없습니다.')
    if ended_at < segment.segment_started_at:
        raise HTTPException(409, '기기 시간이 시작 시각보다 빠릅니다. 시간을 확인해 주세요.')
    segment.segment_ended_at = ended_at
    segment.record_source = source
    return segment


def expire_unfinished_timer(database, timer: workoutTimer, now: datetime):
    if timer.status not in {'running', 'paused'} or now - timer.created_at < timedelta(seconds=maximum_running_seconds):
        return False
    timer.status = 'needs_review'
    timer.finished_at = now
    timer.needs_review_reason = '종료 시각을 확인해 주세요.'
    timer.revision += 1
    return True


@router.post('/workout-timers', status_code=201)
def start_workout_timer(
    payload: workoutTimerStart,
    user: userDependency,
    database: databaseDependency,
):
    request_id = str(payload.request_id)
    lock_user(database, user.user_id)
    previous_event = database.scalar(
        select(workoutTimerEvent)
        .join(workoutTimer, workoutTimer.timer_id == workoutTimerEvent.timer_id)
        .where(
            workoutTimer.user_id == user.user_id,
            workoutTimerEvent.request_id == request_id,
            workoutTimerEvent.action == 'start',
        )
    )
    if previous_event:
        existing_timer = database.get(workoutTimer, previous_event.timer_id)
        return timer_output(database, existing_timer)
    now = utc_now()
    existing_timer = database.scalar(
        select(workoutTimer)
        .where(workoutTimer.user_id == user.user_id, workoutTimer.status.in_(['running', 'paused']))
        .with_for_update()
    )
    if existing_timer:
        if expire_unfinished_timer(database, existing_timer, now):
            database.commit()
            raise HTTPException(409, '종료 시각 확인이 필요한 기록을 먼저 정리해 주세요.')
        raise HTTPException(409, '먼저 진행 중인 운동 시간을 종료해 주세요.')
    timer = workoutTimer(
        timer_uuid=str(uuid4()),
        user_id=user.user_id,
        status='running',
        started_at=now,
        measured_seconds=0,
        record_source='timer_recorded',
        revision=1,
    )
    database.add(timer)
    database.flush()
    database.add(
        workoutTimerSegment(
            timer_id=timer.timer_id,
            segment_started_at=now,
            record_source='timer_recorded',
            segment_status='accepted',
        )
    )
    add_timer_event(database, timer, request_id, 'start', 0, now)
    try:
        database.commit()
    except IntegrityError:
        database.rollback()
        raise HTTPException(409, '다른 기기에서 운동 시간을 시작했습니다. 현재 상태를 불러와 주세요.') from None
    return timer_output(database, timer, now)


@router.get('/workout-timers/current')
def read_current_workout_timer(user: userDependency, database: databaseDependency):
    now = utc_now()
    timer = database.scalar(
        select(workoutTimer)
        .where(workoutTimer.user_id == user.user_id, workoutTimer.status.in_(['running', 'paused']))
        .order_by(workoutTimer.started_at.desc())
        .limit(1)
        .with_for_update()
    )
    if timer is None:
        review_timer = database.scalar(
            select(workoutTimer)
            .where(workoutTimer.user_id == user.user_id, workoutTimer.status == 'needs_review')
            .order_by(workoutTimer.started_at.desc())
            .limit(1)
        )
        database.commit()
        return {'timer': timer_output(database, review_timer, now) if review_timer else None, 'server_now': now.isoformat() + 'Z'}
    if expire_unfinished_timer(database, timer, now):
        timer.measured_seconds = segment_seconds(database, timer.timer_id)
        database.commit()
        return {'timer': timer_output(database, timer, now), 'server_now': now.isoformat() + 'Z'}
    database.commit()
    return {'timer': timer_output(database, timer, now), 'server_now': now.isoformat() + 'Z'}


@router.post('/workout-timers/{timer_uuid}/actions')
def act_on_workout_timer(
    timer_uuid: str,
    payload: workoutTimerAction,
    user: userDependency,
    database: databaseDependency,
):
    request_id = str(payload.request_id)
    lock_user(database, user.user_id)
    timer = find_owned_timer(database, timer_uuid, user.user_id, lock=True)
    previous_event = previous_request(database, timer.timer_id, request_id)
    if previous_event:
        database.commit()
        return timer_output(database, timer)
    now = utc_now()
    if expire_unfinished_timer(database, timer, now):
        timer.measured_seconds = segment_seconds(database, timer.timer_id)
        database.commit()
        raise HTTPException(409, '종료 시각 확인이 필요한 기록입니다.')
    if payload.expected_revision != timer.revision:
        raise HTTPException(409, '운동 시간 상태가 바뀌었습니다. 최신 상태를 다시 불러와 주세요.')
    if payload.action == 'pause':
        if timer.status != 'running':
            raise HTTPException(409, '진행 중인 운동 시간만 정지할 수 있습니다.')
        close_open_segment(database, timer, now, 'timer_recorded')
        timer.measured_seconds = segment_seconds(database, timer.timer_id)
        timer.status = 'paused'
    elif payload.action == 'resume':
        if timer.status != 'paused':
            raise HTTPException(409, '정지된 운동 시간만 다시 시작할 수 있습니다.')
        timer.status = 'running'
        database.add(
            workoutTimerSegment(
                timer_id=timer.timer_id,
                segment_started_at=now,
                record_source='timer_recorded',
                segment_status='accepted',
            )
        )
    elif payload.action == 'finish':
        if timer.status not in {'running', 'paused'}:
            raise HTTPException(409, '종료할 수 있는 운동 시간이 없습니다.')
        if timer.status == 'running':
            close_open_segment(database, timer, now, 'timer_recorded')
        timer.measured_seconds = segment_seconds(database, timer.timer_id)
        timer.status = 'finished'
        timer.finished_at = now
    else:
        if timer.status not in {'running', 'paused', 'needs_review'}:
            raise HTTPException(409, '제외할 수 있는 운동 시간이 없습니다.')
        if timer.status == 'running':
            open_segment = database.scalar(
                select(workoutTimerSegment).where(
                    workoutTimerSegment.timer_id == timer.timer_id,
                    workoutTimerSegment.segment_ended_at.is_(None),
                )
            )
            if open_segment:
                open_segment.segment_status = 'superseded'
        timer.status = 'discarded'
        timer.finished_at = now
        timer.measured_seconds = 0
    timer.revision += 1
    timer.needs_review_reason = None
    add_timer_event(database, timer, request_id, payload.action, payload.expected_revision, now)
    database.commit()
    return timer_output(database, timer, now)


@router.post('/workout-timers/{timer_uuid}/reconcile')
def reconcile_offline_timer(
    timer_uuid: str,
    payload: workoutTimerReconcile,
    user: userDependency,
    database: databaseDependency,
):
    request_id = str(payload.request_id)
    lock_user(database, user.user_id)
    timer = find_owned_timer(database, timer_uuid, user.user_id, lock=True)
    previous_event = previous_request(database, timer.timer_id, request_id)
    if previous_event:
        database.commit()
        return timer_output(database, timer)
    now = utc_now()
    if timer.status not in {'running', 'paused', 'needs_review'}:
        raise HTTPException(409, '복구할 수 있는 운동 시간 상태가 아닙니다.')
    client_value = payload.client_action_at
    if client_value.tzinfo is None:
        raise HTTPException(422, '기기 시각에는 시간대 정보가 필요합니다.')
    client_action_at = client_value.astimezone(timezone.utc).replace(tzinfo=None)
    if client_action_at > now + timedelta(minutes=5) or client_action_at < timer.started_at:
        raise HTTPException(409, '기기 시각을 확인할 수 없어 측정 시간을 복구하지 못했습니다.')
    if payload.expected_revision > timer.revision:
        raise HTTPException(409, '운동 시간 버전이 올바르지 않습니다.')
    if timer.status in {'running', 'needs_review'}:
        open_segment = database.scalar(
            select(workoutTimerSegment).where(
                workoutTimerSegment.timer_id == timer.timer_id,
                workoutTimerSegment.segment_ended_at.is_(None),
            )
        )
    else:
        open_segment = None
    if open_segment:
        close_open_segment(database, timer, client_action_at, 'self_reported')
    elif timer.status == 'paused' and payload.action == 'finish':
        pass
    timer.measured_seconds = segment_seconds(database, timer.timer_id)
    timer.status = 'needs_review'
    timer.finished_at = now
    timer.record_source = 'self_reported'
    timer.needs_review_reason = '네트워크 복구 후 운동 시간을 확인해 주세요.'
    timer.revision += 1
    add_timer_event(
        database,
        timer,
        request_id,
        'reconcile',
        payload.expected_revision,
        now,
        client_action_at,
    )
    database.commit()
    return timer_output(database, timer, now)


@router.post('/workout-timers/{timer_uuid}/corrections')
def correct_workout_timer(
    timer_uuid: str,
    payload: workoutTimerCorrection,
    user: userDependency,
    database: databaseDependency,
):
    lock_user(database, user.user_id)
    timer = find_owned_timer(database, timer_uuid, user.user_id, lock=True)
    if timer.status not in {'needs_review', 'finished'}:
        raise HTTPException(409, '종료되었거나 확인이 필요한 시간만 보정할 수 있습니다.')
    now = utc_now()
    previous_seconds = timer.measured_seconds
    database.add(
        workoutTimerRevision(
            timer_id=timer.timer_id,
            previous_seconds=previous_seconds,
            updated_seconds=payload.measured_seconds,
            changed_by_user_id=user.user_id,
            reason=payload.reason,
            created_at=now,
        )
    )
    for segment in database.scalars(
        select(workoutTimerSegment).where(workoutTimerSegment.timer_id == timer.timer_id)
    ):
        segment.segment_status = 'superseded'
    if payload.measured_seconds:
        database.add(
            workoutTimerSegment(
                timer_id=timer.timer_id,
                segment_started_at=timer.started_at,
                segment_ended_at=timer.started_at + timedelta(seconds=payload.measured_seconds),
                record_source='self_reported',
                segment_status='accepted',
            )
        )
    timer.measured_seconds = payload.measured_seconds
    timer.record_source = 'self_reported'
    timer.status = 'finished'
    timer.finished_at = timer.finished_at or now
    timer.needs_review_reason = None
    timer.revision += 1
    database.commit()
    return timer_output(database, timer, now)


@router.get('/workout-times')
def read_workout_times(
    user: userDependency,
    database: databaseDependency,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
):
    user_timezone = ZoneInfo(user.timezone)
    today = datetime.now(user_timezone).date()
    date_to = date_to or today
    date_from = date_from or today - timedelta(days=30)
    if date_to < date_from or (date_to - date_from).days > 365:
        raise HTTPException(422, '조회 기간은 1년 이내로 선택해 주세요.')
    timers = database.scalars(
        select(workoutTimer).where(
            workoutTimer.user_id == user.user_id,
            workoutTimer.status == 'finished',
            workoutTimer.started_at < datetime.combine(date_to + timedelta(days=1), time.min, user_timezone)
            .astimezone(timezone.utc).replace(tzinfo=None),
        )
    ).all()
    totals_by_date = {}
    for timer in timers:
        for segment in database.scalars(
            select(workoutTimerSegment).where(
                workoutTimerSegment.timer_id == timer.timer_id,
                workoutTimerSegment.segment_status == 'accepted',
                workoutTimerSegment.segment_ended_at.is_not(None),
            )
        ):
            segment_start = segment.segment_started_at.replace(tzinfo=timezone.utc)
            segment_end = segment.segment_ended_at.replace(tzinfo=timezone.utc)
            cursor = segment_start
            while cursor < segment_end:
                local_date = cursor.astimezone(user_timezone).date()
                next_local_day = datetime.combine(
                    local_date + timedelta(days=1), time.min, user_timezone
                ).astimezone(timezone.utc)
                slice_end = min(segment_end, next_local_day)
                seconds = (slice_end - cursor).total_seconds()
                if date_from <= local_date <= date_to:
                    day_entry = totals_by_date.setdefault(local_date.isoformat(), {
                        'measured_seconds': 0.0,
                        'timer_recorded_seconds': 0.0,
                        'self_reported_seconds': 0.0,
                        'timer_ids': set(),
                    })
                    day_entry['measured_seconds'] += seconds
                    day_entry[f'{segment.record_source}_seconds'] += seconds
                    day_entry['timer_ids'].add(timer.timer_uuid)
                cursor = slice_end
    return {
        'date_from': date_from.isoformat(),
        'date_to': date_to.isoformat(),
        'days': [
            {
                'workout_date': workout_date,
                'measured_seconds': floor(values['measured_seconds']),
                'timer_recorded_seconds': floor(values['timer_recorded_seconds']),
                'self_reported_seconds': floor(values['self_reported_seconds']),
                'timer_count': len(values['timer_ids']),
                'measurement_status': 'measured',
            }
            for workout_date, values in sorted(totals_by_date.items())
        ],
    }
