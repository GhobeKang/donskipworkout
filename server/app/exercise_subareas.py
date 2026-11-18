"""Reference-based exercise targets, loaded in batches without multiplying saved sets."""

from collections import defaultdict
from hashlib import md5

from fastapi import HTTPException
from sqlalchemy import delete, select

from .database import (
    exerciseItem,
    exerciseItemSubarea,
    exerciseSubarea,
    sharedExerciseItemSubarea,
)


def subarea_output(subarea):
    return {field: getattr(subarea, field) for field in (
        'subarea_id', 'target_area', 'label_ko', 'label_en', 'body_group', 'side',
        'views', 'atlas_muscle_ids', 'is_legacy', 'sort_order',
    )}


def legacy_subarea_id(target_area, target_subarea):
    identity = f'{target_area or ""}\x1f{target_subarea}'.encode()
    return f'legacy_{md5(identity, usedforsecurity=False).hexdigest()}'


def subareas_by_exercise(database, user_id):
    targets = defaultdict(list)
    for source, link_model in (
        ('custom', exerciseItemSubarea), ('shared', sharedExerciseItemSubarea),
    ):
        statement = select(link_model.exercise_id, exerciseSubarea).join(
            exerciseSubarea, exerciseSubarea.subarea_id == link_model.subarea_id,
        )
        if source == 'custom':
            statement = statement.join(
                exerciseItem, exerciseItem.exercise_id == link_model.exercise_id,
            ).where(exerciseItem.user_id == user_id)
        for exercise_id, subarea in database.execute(statement.order_by(exerciseSubarea.sort_order)):
            targets[(source, exercise_id)].append(subarea_output(subarea))
    return targets


def validate_exercise_subareas(database, payload):
    subarea_ids = payload.target_subarea_ids
    # Older clients may still send the retired scalar; only IDs are written below.
    if 'target_subarea_ids' not in payload.model_fields_set and payload.target_subarea:
        subarea_ids = [legacy_subarea_id(payload.target_area, payload.target_subarea)]
    if not subarea_ids:
        return []
    subareas = database.scalars(select(exerciseSubarea).where(
        exerciseSubarea.subarea_id.in_(subarea_ids),
    ).order_by(exerciseSubarea.sort_order)).all()
    if {item.subarea_id for item in subareas} != set(subarea_ids):
        raise HTTPException(422, '선택한 타겟 부위를 찾을 수 없습니다. 목록을 새로고침해 주세요.')
    if any(item.target_area != payload.target_area for item in subareas):
        raise HTTPException(422, '세부 타겟 부위는 선택한 큰 카테고리에 속해야 합니다.')
    return [subarea_output(item) for item in subareas]


def replace_exercise_subareas(database, exercise_id, subareas):
    database.execute(delete(exerciseItemSubarea).where(exerciseItemSubarea.exercise_id == exercise_id))
    database.add_all([
        exerciseItemSubarea(exercise_id=exercise_id, subarea_id=item['subarea_id'])
        for item in subareas
    ])


def report_area_paths(target_area, subareas):
    paths = {f'{item["target_area"]} · {item["label_ko"]}' for item in subareas}
    return sorted(paths) if paths else [target_area or '타겟 부위 미설정']


def set_report_area_paths(workout_set):
    return getattr(workout_set, 'target_areas', None) or [
        workout_set.target_area or '타겟 부위 미설정',
    ]
