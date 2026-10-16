"""Versioned, deterministic photo effects shared with the browser via the catalog API."""

import json
from datetime import timezone
from decimal import Decimal
from functools import lru_cache
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from PIL import (
    Image,
    ImageChops,
    ImageDraw,
    ImageFont,
    ImageOps,
    UnidentifiedImageError,
)

photo_catalog = json.loads(Path(__file__).with_name('photo_effects.json').read_text('utf-8'))
max_upload_bytes = photo_catalog['max_upload_bytes']
photo_asset_dir = Path(__file__).with_name('photo_assets')
photo_characters = {
    'coach_wink': {'asset_name': 'coach.png'},
    'coach_double_biceps': {'asset_name': 'coach_double_biceps.png'},
    'coach_thumbs_up': {'asset_name': 'coach_thumbs_up.png'},
    'coach_dumbbell_curl': {'asset_name': 'coach_dumbbell_curl.png'},
    'coach_victory': {'asset_name': 'coach_victory.png'},
}
photo_area_labels = {
    '가슴': 'Chest',
    '등': 'Back',
    '어깨': 'Shoulders',
    '이두': 'Biceps',
    '삼두': 'Triceps',
    '복근': 'Abs',
    '엉덩이': 'Glutes',
    '허벅지': 'Thighs',
    '종아리': 'Calves',
    '전신': 'Full body',
}


def local_capture_time(captured_at, capture_timezone):
    if captured_at.tzinfo is None or captured_at.utcoffset() is None:
        raise HTTPException(422, '촬영 시각에 시간대 정보가 필요합니다.')
    try:
        return captured_at.astimezone(ZoneInfo(capture_timezone))
    except (ZoneInfoNotFoundError, ValueError, OverflowError):
        raise HTTPException(422, '촬영 시간대가 올바르지 않습니다.') from None


def photo_workout_summary_hash(workout_summary):
    summary_json = json.dumps(workout_summary, ensure_ascii=False, separators=(',', ':'))
    return sha256(summary_json.encode()).hexdigest()


def photo_branding_id(
    captured_at,
    capture_timezone,
    workout_summary_hash,
    branding_language,
    character_id,
):
    local_capture_time(captured_at, capture_timezone)
    if character_id not in photo_characters:
        raise HTTPException(422, '선택한 캐릭터를 찾을 수 없습니다. 화면을 새로고침해 주세요.')
    capture_metadata = '|'.join(
        [
            captured_at.astimezone(timezone.utc).isoformat(),
            capture_timezone,
            workout_summary_hash,
            branding_language,
            character_id,
        ]
    )
    # Retain the legacy DB column, including preview contents in idempotency checks.
    return f'{photo_catalog["branding_id"]}_{sha256(capture_metadata.encode()).hexdigest()[:32]}'


@lru_cache(maxsize=16)
def load_photo_character(character_id):
    character_config = photo_characters.get(character_id)
    if character_config is None:
        raise HTTPException(422, '선택한 캐릭터를 찾을 수 없습니다. 화면을 새로고침해 주세요.')
    with Image.open(photo_asset_dir / character_config['asset_name']) as character_source:
        character = character_source.convert('RGBA')
    character = character.crop(character.getbbox())
    character.thumbnail((180, 252), Image.Resampling.LANCZOS)
    return character


@lru_cache(maxsize=32)
def photo_font(font_size, bold=False):
    font_paths = [
        f'/usr/share/fonts/opentype/noto/NotoSansCJK-{"Bold" if bold else "Regular"}.ttc',
        f'C:/Windows/Fonts/{"malgunbd" if bold else "malgun"}.ttf',
        '/System/Library/Fonts/AppleSDGothicNeo.ttc',
    ]
    for font_path in font_paths:
        if Path(font_path).is_file():
            return ImageFont.truetype(font_path, font_size)
    raise RuntimeError('Photo branding requires Noto Sans CJK (install fonts-noto-cjk).')


def fit_photo_text(drawing, text, font, max_width):
    if drawing.textlength(text, font=font) <= max_width:
        return text
    while text and drawing.textlength(text + '…', font=font) > max_width:
        text = text[:-1]
    return text + '…'


def wrap_photo_text(drawing, text, font, max_width):
    lines = []
    current_line = ''
    for character in ' '.join(text.split()):
        if current_line and drawing.textlength(current_line + character, font=font) > max_width:
            lines.append(current_line.rstrip())
            current_line = character.lstrip()
        else:
            current_line += character
    return [*lines, current_line] if current_line else lines or ['']


def photo_workout_statistics(workout_summary):
    total_volume_kg = sum(
        (Decimal(str(exercise['volume_kg'])) for exercise in workout_summary), Decimal('0')
    )
    area_set_counts = {}
    unclassified_set_count = 0
    for exercise in workout_summary:
        if exercise['target_area']:
            area = exercise['target_area']
            area_set_counts[area] = area_set_counts.get(area, 0) + exercise['set_count']
        else:
            unclassified_set_count += exercise['set_count']
    largest_set_count = max(area_set_counts.values(), default=0)
    primary_areas = sorted(
        area for area, count in area_set_counts.items() if count == largest_set_count
    )
    return total_volume_kg, primary_areas, unclassified_set_count


def photo_workout_layout(drawing, workout_summary, branding_language):
    total_volume_kg, primary_areas, unclassified_set_count = photo_workout_statistics(
        workout_summary
    )
    volume_text = f'{total_volume_kg:,.2f}'.rstrip('0').rstrip('.')
    if branding_language == 'ko':
        area_text = ' · '.join(primary_areas) or '미분류'
        if primary_areas and unclassified_set_count:
            area_text += f' (미분류 {unclassified_set_count}세트)'
        statistics_text = [f'총 중량 · {volume_text} kg', f'주 운동 부위 · {area_text}']
    else:
        area_text = (
            ' · '.join(photo_area_labels.get(area, area) for area in primary_areas)
            or 'Unclassified'
        )
        if primary_areas and unclassified_set_count:
            area_text += f' ({unclassified_set_count} unclassified sets)'
        statistics_text = [f'Total volume · {volume_text} kg', f'Main focus · {area_text}']
    statistics_font = photo_font(20)
    statistics_lines = [
        line
        for text in statistics_text
        for line in wrap_photo_text(drawing, text, statistics_font, photo_catalog['width'] - 96)
    ]
    header_height = 30 + len(statistics_lines) * 27 + 12
    column_count = 2 if len(workout_summary) > 10 else 1
    column_width = (photo_catalog['width'] - 128) // 2 if column_count == 2 else 552
    rows_per_column = (len(workout_summary) + column_count - 1) // column_count
    # Keep all exercises and full names, reducing type only for unusually dense records.
    for font_size in (21, 18, 16, 14, 12, 10, 9):
        exercise_font = photo_font(font_size)
        count_font = photo_font(font_size - 1)
        line_height = font_size + 6
        columns = [[] for _ in range(column_count)]
        column_heights = [0] * column_count
        for exercise_index, exercise in enumerate(workout_summary):
            count_text = (
                f'{exercise["set_count"]}{"세트" if branding_language == "ko" else " sets"}'
            )
            count_width = drawing.textlength(count_text, font=count_font)
            name_lines = wrap_photo_text(
                drawing, exercise['exercise_name'], exercise_font, column_width - count_width - 20
            )
            row_height = len(name_lines) * line_height + 4
            column_index = exercise_index // rows_per_column
            columns[column_index].append((name_lines, count_text, row_height))
            column_heights[column_index] += row_height
        summary_height = header_height + max(column_heights)
        if summary_height <= photo_catalog['height'] - 500 or font_size == 9:
            return {
                'columns': columns,
                'column_width': column_width,
                'exercise_font': exercise_font,
                'count_font': count_font,
                'font_size': font_size,
                'line_height': line_height,
                'header_height': header_height,
                'height': summary_height,
                'statistics_font': statistics_font,
                'statistics_lines': statistics_lines,
            }


def render_photo_branding(
    display_name,
    captured_at,
    capture_timezone,
    workout_summary=(),
    branding_language='ko',
    character_id='coach_wink',
):
    captured_local = local_capture_time(captured_at, capture_timezone)
    width, height = photo_catalog['width'], photo_catalog['height']
    branding = Image.new('RGBA', (width, height))
    drawing = ImageDraw.Draw(branding)
    workout_layout = (
        photo_workout_layout(drawing, workout_summary, branding_language)
        if workout_summary
        else None
    )
    # A soft shadow keeps white text readable without enclosing the photo in a frame.
    shadow_height = max(520, workout_layout['height'] + 400) if workout_layout else 280
    for row in range(shadow_height):
        drawing.line(
            (0, height - shadow_height + row, width, height - shadow_height + row),
            fill=(8, 17, 24, round(215 * (1 - (1 - row / (shadow_height - 1)) ** 4))),
        )
    for row in range(220):
        drawing.line((0, row, width, row), fill=(8, 17, 24, round(180 * (1 - row / 219))))
    with Image.open(photo_asset_dir / 'logo.png') as logo_source:
        logo_image = logo_source.convert('RGBA')
        logo_background = Image.new('RGB', logo_image.size, 'white')
        logo_difference = ImageChops.difference(logo_image.convert('RGB'), logo_background)
        logo_bounds = (
            logo_difference.convert('L')
            .point(
                lambda value: 255 if value > 24 else 0,
            )
            .getbbox()
        )
        if logo_bounds:
            logo_image = logo_image.crop(logo_bounds)
        logo_image.thumbnail((84, 84), Image.Resampling.LANCZOS)
        logo_mask = Image.new('L', logo_image.size)
        ImageDraw.Draw(logo_mask).rounded_rectangle(
            (0, 0, logo_image.width - 1, logo_image.height - 1),
            radius=round(logo_image.width * 0.23),
            fill=255,
        )
        logo_image.putalpha(logo_mask)
        branding.alpha_composite(logo_image, (48, 48))
    brand_font = photo_font(46, bold=True)
    brand_text = 'DON’T SKIP'
    brand_position = (152, 68)
    drawing.text(brand_position, brand_text, font=brand_font, fill='white', anchor='lt')
    brand_bottom = drawing.textbbox(brand_position, brand_text, font=brand_font, anchor='lt')[3]
    drawing.text(
        (152 + drawing.textlength(brand_text, font=brand_font), brand_bottom),
        '.',
        font=brand_font,
        fill='#ff861d',
        anchor='lb',
    )
    name_text = ' '.join((display_name or 'MEMBER').split()) or 'MEMBER'
    name_font = photo_font(42, bold=True)
    name_max_width = width - 2 * 48 - 180 - 24
    if drawing.textlength(name_text, font=name_font) > name_max_width:
        name_font = photo_font(30, bold=True)
        name_text = fit_photo_text(drawing, name_text, name_font, name_max_width)
    drawing.text((48, height - 174), name_text, font=name_font, fill='white', anchor='lt')
    drawing.text(
        (48, height - 104),
        captured_local.strftime('%Y.%m.%d  %H:%M:%S'),
        font=photo_font(30),
        fill='white',
        anchor='lt',
    )
    utc_offset = captured_local.strftime('%z')
    timezone_label = f'UTC{utc_offset[:3]}:{utc_offset[3:5]}'
    drawing.text(
        (48, height - 62), timezone_label, font=photo_font(23), fill='#e1e8ed', anchor='lt'
    )
    if workout_layout:
        summary_top = height - 280 - workout_layout['height']
        drawing.text(
            (48, summary_top),
            '오늘의 운동' if branding_language == 'ko' else 'WORKOUT',
            font=photo_font(20, bold=True),
            fill='#ffb879',
            anchor='lt',
            stroke_width=1,
            stroke_fill=(8, 17, 24, 200),
        )
        for line_index, statistics_line in enumerate(workout_layout['statistics_lines']):
            drawing.text(
                (48, summary_top + 30 + line_index * 27),
                statistics_line,
                font=workout_layout['statistics_font'],
                fill='white',
                anchor='lt',
                stroke_width=1,
                stroke_fill=(8, 17, 24, 200),
            )
        for column_index, exercise_rows in enumerate(workout_layout['columns']):
            column_left = 48 + column_index * (workout_layout['column_width'] + 32)
            row_top = summary_top + workout_layout['header_height']
            for name_lines, count_text, row_height in exercise_rows:
                for line_index, name_line in enumerate(name_lines):
                    drawing.text(
                        (column_left, row_top + line_index * workout_layout['line_height']),
                        name_line,
                        font=workout_layout['exercise_font'],
                        fill='white',
                        anchor='lt',
                        stroke_width=1,
                        stroke_fill=(8, 17, 24, 200),
                    )
                drawing.text(
                    (column_left + workout_layout['column_width'], row_top),
                    count_text,
                    font=workout_layout['count_font'],
                    fill='#e1e8ed',
                    anchor='rt',
                    stroke_width=1,
                    stroke_fill=(8, 17, 24, 200),
                )
                row_top += row_height
    character = load_photo_character(character_id)
    branding.alpha_composite(
        character, (width - 48 - character.width, height - 48 - character.height)
    )
    return branding


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
                    f'사진 해상도는 {photo_catalog["width"]} × {photo_catalog["height"]}이어야 합니다.',
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


def render_photo(
    original_photo,
    display_name,
    captured_at,
    capture_timezone,
    workout_summary=(),
    branding_language='ko',
    character_id='coach_wink',
):
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
    branding = render_photo_branding(
        display_name,
        captured_at,
        capture_timezone,
        workout_summary,
        branding_language,
        character_id,
    )
    return Image.alpha_composite(rendered_photo.convert('RGBA'), branding).convert('RGB')


def resolve_photo_path(storage_dir, storage_key):
    storage_root = Path(storage_dir).resolve()
    photo_path = (storage_root / storage_key).resolve()
    if not photo_path.is_relative_to(storage_root) or photo_path == storage_root:
        raise HTTPException(404, '사진을 찾을 수 없습니다.')
    return photo_path
