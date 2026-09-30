"""Versioned, deterministic photo effects shared with the browser via the catalog API."""

import json
import re
from hashlib import sha256
from io import BytesIO
from pathlib import Path

from fastapi import HTTPException
from PIL import Image, ImageDraw, ImageOps, UnidentifiedImageError

photo_catalog = json.loads(Path(__file__).with_name('photo_effects.json').read_text('utf-8'))
static_photo_frames = {frame['frame_id']: frame for frame in photo_catalog['frames']}
max_upload_bytes = photo_catalog['max_upload_bytes']
photo_frame_id_pattern = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$')


def list_photo_frames(photo_frame_dir):
    frame_directory = Path(photo_frame_dir)
    image_frames = []
    if not frame_directory.is_dir():
        return image_frames
    for frame_path in sorted(frame_directory.glob('*.png')):
        frame_id = frame_path.stem
        if (
            not frame_path.is_file()
            or not photo_frame_id_pattern.fullmatch(frame_id)
            or frame_id in static_photo_frames
        ):
            continue
        image_frames.append({
            'frame_id': frame_id,
            'label': frame_id.replace('_', ' ').replace('-', ' ').title(),
            'image_url': f'/photo-frames/{frame_id}',
        })
    return image_frames


def read_photo_catalog(photo_frame_dir):
    return {
        **photo_catalog,
        'frames': [*list_photo_frames(photo_frame_dir), *static_photo_frames.values()],
    }


def prepare_photo(raw_bytes, content_type):
    if not raw_bytes or len(raw_bytes) > max_upload_bytes:
        raise HTTPException(413, '사진은 2MB 이하여야 합니다.')
    if content_type != 'image/jpeg':
        raise HTTPException(415, 'JPEG 사진이 필요합니다.')
    try:
        with Image.open(BytesIO(raw_bytes), formats=['JPEG']) as source:
            if source.size != (photo_catalog['width'], photo_catalog['height']):
                raise HTTPException(
                    422,
                    f"사진 해상도는 {photo_catalog['width']} × {photo_catalog['height']}이어야 합니다.",
                )
            source.verify()
        with Image.open(BytesIO(raw_bytes), formats=['JPEG']) as source:
            source.load()  # verify() alone does not fully decode JPEG pixels.
            normalized = ImageOps.exif_transpose(source).convert('RGB')
            if normalized.size != (photo_catalog['width'], photo_catalog['height']):
                raise HTTPException(422, '사진 방향이 올바르지 않습니다.')
            # Strip EXIF, GPS, ICC and trailing payloads by encoding only decoded pixels.
            clean_photo = Image.new('RGB', normalized.size)
            clean_photo.paste(normalized)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, '손상되었거나 올바르지 않은 사진입니다.') from None
    return clean_photo, sha256(clean_photo.tobytes()).hexdigest()


def render_photo(original_photo, frame_id, photo_frame_dir):
    effect = photo_catalog['filter']
    channel_tables = []
    for offset in effect['channel_offsets']:
        channel_tables.extend(
            max(
                0,
                min(
                    255,
                    int(
                        ((value - 128) * effect['contrast'] + 128) * effect['brightness']
                        + offset
                        + 0.5
                    ),
                ),
            )
            for value in range(256)
        )
    rendered_photo = original_photo.point(channel_tables)
    frame = static_photo_frames.get(frame_id)
    if frame is None:
        if not photo_frame_id_pattern.fullmatch(frame_id):
            raise ValueError('Invalid photo frame identifier')
        frame_path = Path(photo_frame_dir).resolve() / f'{frame_id}.png'
        if not frame_path.is_file():
            raise FileNotFoundError('Photo frame PNG is missing')
        with Image.open(frame_path) as frame_source:
            frame_overlay = frame_source.convert('RGBA')
        frame_overlay.thumbnail(rendered_photo.size, Image.Resampling.LANCZOS)
        centered_overlay = Image.new('RGBA', rendered_photo.size)
        centered_overlay.alpha_composite(
            frame_overlay,
            ((rendered_photo.width - frame_overlay.width) // 2, (rendered_photo.height - frame_overlay.height) // 2),
        )
        return Image.alpha_composite(rendered_photo.convert('RGBA'), centered_overlay).convert('RGB')
    drawing = ImageDraw.Draw(rendered_photo)
    for shape in frame.get('shapes', []):
        left, top, width, height = shape['box']
        drawing.rectangle((left, top, left + width - 1, top + height - 1), fill=shape['color'])
    return rendered_photo


def resolve_photo_path(storage_dir, storage_key):
    storage_root = Path(storage_dir).resolve()
    photo_path = (storage_root / storage_key).resolve()
    if not photo_path.is_relative_to(storage_root) or photo_path == storage_root:
        raise HTTPException(404, '사진을 찾을 수 없습니다.')
    return photo_path
