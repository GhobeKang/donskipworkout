from datetime import date, time
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select

from .database import userAccount, workoutPhoto, workoutSession
from .photo_processing import (
    list_photo_frames,
    max_upload_bytes,
    photo_catalog,
    photo_frame_id_pattern,
    prepare_photo,
    read_photo_catalog,
    render_photo,
    resolve_photo_path,
    static_photo_frames,
)
from .presentation import local_today, session_output, settings_output
from .schemas import sessionData
from .security import databaseDependency, userDependency, utc_now

router = APIRouter(prefix='/api/v1')


@router.get('/photo-effects')
def read_photo_effects(request: Request, user: userDependency):
    return read_photo_catalog(request.app.state.settings.photo_frame_dir)


@router.get('/photo-frames/{frame_id}')
def read_photo_frame(frame_id: str, request: Request, user: userDependency):
    if not photo_frame_id_pattern.fullmatch(frame_id):
        raise HTTPException(404, '프레임 이미지를 찾을 수 없습니다.')
    frame_path = Path(request.app.state.settings.photo_frame_dir).resolve() / f'{frame_id}.png'
    if not frame_path.is_file():
        raise HTTPException(404, '프레임 이미지를 찾을 수 없습니다.')
    return FileResponse(frame_path, media_type='image/png', headers={'Cache-Control': 'no-store'})


@router.post('/sessions/today/photo', response_model=sessionData)
def complete_photo(
    request: Request,
    user: userDependency,
    database: databaseDependency,
    photo: Annotated[UploadFile, File()],
    frame_id: Annotated[str, Form(max_length=64)],
    filter_id: Annotated[str, Form(max_length=64)],
    effect_version: Annotated[int, Form()],
    workout_date: Annotated[date, Form()],
    submission_id: Annotated[UUID, Form()],
    note: Annotated[str, Form(max_length=1000)] = '',
):
    available_image_frame_ids = {
        frame['frame_id'] for frame in list_photo_frames(request.app.state.settings.photo_frame_dir)
    }
    if (
        (frame_id not in static_photo_frames and frame_id not in available_image_frame_ids)
        or filter_id != photo_catalog['filter']['filter_id']
        or effect_version != photo_catalog['effect_version']
    ):
        raise HTTPException(422, '사진 효과가 변경되었습니다. 화면을 새로고침해 주세요.')
    raw_bytes = photo.file.read(max_upload_bytes + 1)
    original_photo, original_hash = prepare_photo(raw_bytes, photo.content_type)
    rendered_photo = render_photo(
        original_photo, frame_id, request.app.state.settings.photo_frame_dir
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
            or existing.frame_id != frame_id
            or saved_session.workout_date != workout_date
            or (saved_session.note or '') != note.strip()
        ):
            raise HTTPException(409, '이미 처리된 요청의 내용이 다릅니다.')
        return session_output(saved_session, local_today())
    today = local_today()
    if workout_date != today:
        raise HTTPException(409, '날짜가 변경되었습니다. 오늘 화면에서 다시 촬영해 주세요.')
    session = database.scalar(
        select(workoutSession)
        .where(workoutSession.user_id == user.user_id, workoutSession.workout_date == today)
        .with_for_update()
    )
    if session and session.session_status in {'completed', 'rest', 'missed'}:
        raise HTTPException(409, '이미 종료된 운동입니다. 기록을 확인해 주세요.')
    duplicate = database.scalar(
        select(workoutPhoto.photo_id)
        .join(workoutSession)
        .where(workoutSession.user_id == user.user_id, workoutPhoto.original_hash == original_hash)
        .limit(1)
    )
    if duplicate:
        raise HTTPException(409, '이미 사용한 사진입니다. 오늘 운동 사진을 다시 촬영해 주세요.')
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
        session.photos.append(
            workoutPhoto(
                photo_uuid=photo_uuid,
                submission_id=str(submission_id),
                storage_key=rendered_key,
                original_storage_key=original_key,
                original_hash=original_hash,
                frame_id=frame_id,
                filter_id=filter_id,
                effect_version=effect_version,
                is_reusable=settings['reuse_enabled'],
            )
        )
        session.session_status = 'completed'
        session.verification_type = 'photo'
        session.completed_at = utc_now()
        session.reusable = settings['reuse_enabled']
        session.note = note.strip() or None
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
