"""Reference-based exercise targets, loaded in batches without multiplying saved sets."""

import json
from collections import defaultdict
from hashlib import md5
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import delete, select

from .database import (
    exerciseItem,
    exerciseItemSubarea,
    exerciseSubarea,
    sharedExerciseItemSubarea,
)

target_definitions = {
    item['subarea_id']: item for item in json.loads(
        Path(__file__).with_name('exercise_subareas.json').read_text(encoding='utf-8')
    )
}
training_targets_by_area = defaultdict(list)
for target_definition in target_definitions.values():
    if target_definition.get('is_training_target'):
        training_targets_by_area[target_definition['target_area']].append(target_definition)
default_training_targets = {
    area: targets[0] for area, targets in training_targets_by_area.items() if len(targets) == 1
}
default_training_targets.update({
    area: target_definitions[target_id] for area, target_id in (
        ('가슴', 'training_chest_all'), ('이두', 'training_biceps'),
        ('삼두', 'training_triceps'), ('전완', 'training_forearms'),
    )
})


def subarea_output(subarea):
    stored_fields = {field: getattr(subarea, field) for field in (
        'subarea_id', 'target_area', 'label_ko', 'label_en', 'body_group', 'side',
        'views', 'atlas_muscle_ids', 'is_legacy', 'sort_order',
    )}
    definition = target_definitions.get(subarea.subarea_id, {})
    return {**stored_fields, **definition, 'target_area': subarea.target_area}


def legacy_subarea_id(target_area, target_subarea):
    identity = f'{target_area or ""}\x1f{target_subarea}'.encode()
    return f'legacy_{md5(identity, usedforsecurity=False).hexdigest()}'


def available_training_subareas(database, subareas):
    target_ids = {item.get('training_target_id') for item in subareas if item.get('training_target_id')}
    if not target_ids:
        return {}
    return {item.subarea_id: subarea_output(item) for item in database.scalars(
        select(exerciseSubarea).where(exerciseSubarea.subarea_id.in_(target_ids)),
    )}


def normalize_training_subareas(subareas, training_by_id):
    normalized = {}
    for subarea in subareas:
        training = training_by_id.get(subarea.get('training_target_id'))
        target = training if (
            training and training.get('is_training_target')
            and training['target_area'] == subarea['target_area']
        ) else subarea
        normalized.setdefault(target['subarea_id'], target)
    parent_ids = {parent_id for item in normalized.values()
                  for parent_id in item.get('parent_subarea_ids', [])}
    return sorted((item for target_id, item in normalized.items() if target_id not in parent_ids),
                  key=lambda item: item['sort_order'])


def report_training_subareas(target_area, subareas):
    # Reports can group historical references without changing stored links.
    described = [{**target_definitions.get(item['subarea_id'], {}), **item} for item in subareas]
    if described:
        return normalize_training_subareas(described, target_definitions)
    default = default_training_targets.get(target_area)
    return [default] if default else []


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
    training_by_id = available_training_subareas(
        database, [target for exercise_targets in targets.values() for target in exercise_targets],
    )
    return {key: normalize_training_subareas(exercise_targets, training_by_id)
            for key, exercise_targets in targets.items()}


def validate_exercise_subareas(database, payload):
    subarea_ids = payload.target_subarea_ids
    # Older clients may still send the retired scalar; only IDs are written below.
    if 'target_subarea_ids' not in payload.model_fields_set and payload.target_subarea:
        subarea_ids = [legacy_subarea_id(payload.target_area, payload.target_subarea)]
    if not subarea_ids:
        default = default_training_targets.get(payload.target_area)
        if not default:
            return []
        stored_default = database.get(exerciseSubarea, default['subarea_id'])
        return [subarea_output(stored_default)] if stored_default and stored_default.target_area == payload.target_area else []
    subareas = database.scalars(select(exerciseSubarea).where(
        exerciseSubarea.subarea_id.in_(subarea_ids),
    ).order_by(exerciseSubarea.sort_order)).all()
    if {item.subarea_id for item in subareas} != set(subarea_ids):
        raise HTTPException(422, '선택한 타겟 부위를 찾을 수 없습니다. 목록을 새로고침해 주세요.')
    if any(item.target_area != payload.target_area for item in subareas):
        raise HTTPException(422, '세부 타겟 부위는 선택한 큰 카테고리에 속해야 합니다.')
    targets = [subarea_output(item) for item in subareas]
    return normalize_training_subareas(targets, available_training_subareas(database, targets))


def replace_exercise_subareas(database, exercise_id, subareas):
    database.execute(delete(exerciseItemSubarea).where(exerciseItemSubarea.exercise_id == exercise_id))
    database.add_all([
        exerciseItemSubarea(exercise_id=exercise_id, subarea_id=item['subarea_id'])
        for item in subareas
    ])


def report_area_paths(target_area, subareas):
    paths = {f'{item["target_area"]} · {item["label_ko"]}'
             for item in report_training_subareas(target_area, subareas)}
    return sorted(paths) if paths else [target_area or '타겟 부위 미설정']


def set_report_area_paths(workout_set):
    return getattr(workout_set, 'target_areas', None) or [
        workout_set.target_area or '타겟 부위 미설정',
    ]
