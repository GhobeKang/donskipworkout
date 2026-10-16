from base64 import b64encode
from datetime import date, datetime, time
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import and_, func, select

from .challenge_service import record_activity_for_challenges
from .database import (
    exerciseItem,
    sharedExerciseItem,
    userAccount,
    workoutPhoto,
    workoutSession,
    workoutSet,
)
from .photo_processing import (
    max_upload_bytes,
    photo_branding_id,
    photo_catalog,
    photo_characters,
    photo_workout_summary_hash,
    prepare_photo,
    render_photo,
    render_photo_branding,
    resolve_photo_path,
)
from .presentation import local_today, session_output, settings_output
from .schemas import sessionData
from .security import databaseDependency, userDependency, utc_now

router = APIRouter(prefix='/api/v1')


def photo_workout_summary(database, session):
    if session is None or not session.workout_sets:
        return []
    area_by_set_id = dict(
        database.execute(
            select(
                workoutSet.set_id,
                func.coalesce(sharedExerciseItem.target_area, exerciseItem.target_area),
            )
            .select_from(workoutSet)
            .outerjoin(
                exerciseItem,
                and_(
                    workoutSet.exercise_source == 'custom',
                    workoutSet.exercise_id == exerciseItem.exercise_id,
                    exerciseItem.user_id == session.user_id,
                ),
            )
            .outerjoin(
                sharedExerciseItem,
                and_(
                    workoutSet.exercise_source == 'shared',
                    workoutSet.shared_exercise_id == sharedExerciseItem.exercise_id,
                ),
            )
            .where(workoutSet.session_id == session.session_id)
        ).all()
    )
    exercise_groups = {}
    for workout_set in sorted(
        session.workout_sets, key=lambda item: (item.exercise_order, item.set_order)
    ):
        group = exercise_groups.setdefault(
            workout_set.exercise_order,
            {
                'exercise_name': workout_set.exercise_name,
                'set_count': 0,
                'volume_kg': Decimal('0'),
                'target_area': area_by_set_id.get(workout_set.set_id),
            },
        )
        group['set_count'] += 1
        group['volume_kg'] += workout_set.weight_kg * workout_set.reps
    return [{**group, 'volume_kg': float(group['volume_kg'])} for group in exercise_groups.values()]


@router.get('/photo-effects')
def read_photo_effects(user: userDependency):
    return {**photo_catalog, 'character_ids': list(photo_characters)}


@router.get('/photo-branding')
def read_photo_branding(
    user: userDependency,
    database: databaseDependency,
    captured_at: datetime,
    capture_timezone: Annotated[str, Query(min_length=1, max_length=64)],
    workout_date: date,
    character_id: Annotated[str, Query(min_length=1, max_length=64)],
    branding_language: Literal['ko', 'en'] = 'ko',
):
    if workout_date != local_today(user.timezone):
        raise HTTPException(409, '날짜가 변경되었습니다. 오늘 화면에서 다시 촬영해 주세요.')
    session = database.scalar(
        select(workoutSession).where(
            workoutSession.user_id == user.user_id,
            workoutSession.workout_date == workout_date,
        )
    )
    workout_summary = photo_workout_summary(database, session)
    branding = render_photo_branding(
        user.display_name,
        captured_at,
        capture_timezone,
        workout_summary,
        branding_language,
        character_id,
    )
    output = BytesIO()
    branding.save(output, format='PNG')
    return JSONResponse(
        {
            'image_data_url': f'data:image/png;base64,{b64encode(output.getvalue()).decode()}',
            'workout_summary_hash': photo_workout_summary_hash(workout_summary),
        },
        headers={'Cache-Control': 'no-store'},
    )


@router.post('/sessions/today/photo', response_model=sessionData)
def complete_photo(
    request: Request,
    user: userDependency,
    database: databaseDependency,
    photo: Annotated[UploadFile, File()],
    captured_at: Annotated[datetime, Form()],
    capture_timezone: Annotated[str, Form(min_length=1, max_length=64)],
    workout_summary_hash: Annotated[str, Form(pattern=r'^[a-f0-9]{64}$')],
    character_id: Annotated[str, Form(min_length=1, max_length=64)],
    filter_id: Annotated[str, Form(max_length=64)],
    effect_version: Annotated[int, Form()],
    workout_date: Annotated[date, Form()],
    submission_id: Annotated[UUID, Form()],
    branding_language: Annotated[Literal['ko', 'en'], Form()] = 'ko',
    note: Annotated[str, Form(max_length=1000)] = '',
):
    if (
        filter_id != photo_catalog['filter']['filter_id']
        or effect_version != photo_catalog['effect_version']
    ):
        raise HTTPException(422, '사진 효과가 변경되었습니다. 화면을 새로고침해 주세요.')
    raw_bytes = photo.file.read(max_upload_bytes + 1)
    original_photo, original_hash = prepare_photo(raw_bytes, photo.content_type)
    branding_id = photo_branding_id(
        captured_at,
        capture_timezone,
        workout_summary_hash,
        branding_language,
        character_id,
    )
    # Same user lock as manual attendance: serialize concurrent daily writes.
    database.scalar(
        select(userAccount).where(userAccount.user_id == user.user_id).with_for_update()
    )
    existing = database.scalar(
        select(workoutPhoto).where(workoutPhoto.submission_id == str(submission_id))
    )
    if existing:
        saved_session = database.get(workoutSession, existing.session_id)
        if saved_session.user_id != user.user_id:
            raise HTTPException(409, '다른 업로드 식별자를 사용해 주세요.')
        if (
            existing.original_hash != original_hash
            or existing.frame_id != branding_id
            or saved_session.workout_date != workout_date
            or (saved_session.note or '') != note.strip()
        ):
            raise HTTPException(409, '이미 처리된 요청의 내용이 다릅니다.')
        return session_output(saved_session, local_today(user.timezone))
    today = local_today(user.timezone)
    if workout_date != today:
        raise HTTPException(409, '날짜가 변경되었습니다. 오늘 화면에서 다시 촬영해 주세요.')
    session = database.scalar(
        select(workoutSession)
        .where(workoutSession.user_id == user.user_id, workoutSession.workout_date == today)
        .with_for_update()
    )
    is_photo_supplement = bool(
        session
        and session.session_status == 'completed'
        and session.verification_type == 'manual'
        and not session.photos
    )
    is_return_from_rest = bool(session and session.session_status == 'rest')
    if (
        session
        and session.session_status in {'completed', 'rest', 'missed'}
        and not (is_photo_supplement or is_return_from_rest)
    ):
        raise HTTPException(409, '이미 종료된 운동입니다. 기록을 확인해 주세요.')
    duplicate = database.scalar(
        select(workoutPhoto.photo_id)
        .join(workoutSession)
        .where(workoutSession.user_id == user.user_id, workoutPhoto.original_hash == original_hash)
        .limit(1)
    )
    if duplicate:
        raise HTTPException(409, '이미 사용한 사진입니다. 오늘 운동 사진을 다시 촬영해 주세요.')
    workout_summary = photo_workout_summary(database, session)
    if photo_workout_summary_hash(workout_summary) != workout_summary_hash:
        raise HTTPException(409, '운동 기록이 변경되었습니다. 운동 목록을 새로고침해 주세요.')
    rendered_photo = render_photo(
        original_photo,
        user.display_name,
        captured_at,
        capture_timezone,
        workout_summary,
        branding_language,
        character_id,
    )
    settings = settings_output(database, user.user_id)
    if session is None:
        session = workoutSession(
            session_uuid=str(uuid4()),
            user_id=user.user_id,
            workout_date=today,
            scheduled_time=time.fromisoformat(settings['workout_time']),
            session_status='scheduled',
            snooze_count=0,
        )
        database.add(session)
        database.flush()
    photo_uuid = str(uuid4())
    storage_root = Path(request.app.state.settings.photo_storage_dir).resolve()
    storage_root.mkdir(parents=True, exist_ok=True)
    photo_directory = storage_root / photo_uuid
    photo_directory.mkdir()  # UUID directory is owned by this operation only.
    original_key = f'{photo_uuid}/original.jpg'
    rendered_key = f'{photo_uuid}/rendered.jpg'
    try:
        original_photo.save(photo_directory / 'original.jpg', format='JPEG', quality=92)
        rendered_photo.save(photo_directory / 'rendered.jpg', format='JPEG', quality=92)
        saved_photo = workoutPhoto(
            photo_uuid=photo_uuid,
            submission_id=str(submission_id),
            storage_key=rendered_key,
            original_storage_key=original_key,
            original_hash=original_hash,
            frame_id=branding_id,
            filter_id=filter_id,
            effect_version=effect_version,
            is_reusable=settings['reuse_enabled'],
        )
        session.photos.append(saved_photo)
        session.session_status = 'completed'
        session.verification_type = 'photo'
        accepted_at = utc_now()
        if not is_photo_supplement:
            session.completed_at = accepted_at
        session.reusable = settings['reuse_enabled']
        if not is_photo_supplement or note.strip():
            session.note = note.strip() or None
        database.flush()
        record_activity_for_challenges(
            database,
            user.user_id,
            session.session_id,
            'photo',
            accepted_at,
            saved_photo.photo_id,
        )
        database.commit()
    except Exception:
        database.rollback()
        # Preserve files on an ambiguous commit; deleting them could break a committed row.
        # Unreferenced UUID directories can be reconciled against the DB by an operator.
        raise
    return session_output(session, today)


@router.get('/sessions/{session_uuid}/photo')
def read_photo(
    session_uuid: UUID,
    request: Request,
    user: userDependency,
    database: databaseDependency,
):
    photo = database.scalar(
        select(workoutPhoto)
        .join(workoutSession)
        .where(
            workoutSession.session_uuid == str(session_uuid),
            workoutSession.user_id == user.user_id,
            workoutPhoto.photo_uuid.is_not(None),
        )
        .order_by(workoutPhoto.photo_id.desc())
        .limit(1)
    )
    if photo is None:
        raise HTTPException(404, '사진을 찾을 수 없습니다.')
    photo_path = resolve_photo_path(request.app.state.settings.photo_storage_dir, photo.storage_key)
    if not photo_path.is_file():
        raise HTTPException(404, '사진 파일을 찾을 수 없습니다.')
    return FileResponse(photo_path, media_type='image/jpeg', headers={'Cache-Control': 'no-store'})
