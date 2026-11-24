import target_catalog from '../../../server/app/exercise_subareas.json';

const target_definitions = new Map(target_catalog.map((target) => [target.subarea_id, target]));

export const target_group_definitions = {
  training_targets: { title: '운동 타겟', note: '자세·각도에 따른 강조 부위를 선택하세요. 여러 근육이 함께 작용합니다.' },
  back_lats: { title: '광배근·대원근', note: '광배근 상·하부는 강조 분류이며, 지도에서는 전체 광배근을 공유합니다.' },
  back_upper: { title: '승모근·등 두께', note: '승모근의 상·중·하부와 능형근을 구분합니다.' },
  back_lower: { title: '등 하부', note: null },
  biceps_targets: { title: '이두·상완근', note: null },
  triceps_targets: { title: '삼두', note: null },
  abs_front: { title: '상복부·하복부', note: '상·하복부는 복직근의 강조 분류이며, 지도에서는 전체 복직근을 공유합니다.' },
  abs_obliques: { title: '복사근', note: null },
  abs_deep: { title: '복횡근·코어', note: null },
  thigh_front: { title: '허벅지 앞쪽', note: null },
  thigh_rear: { title: '허벅지 뒤쪽', note: '대퇴이두근 장두·단두는 목록에서 구분합니다. 지도에서는 전체 대퇴이두근을 공유합니다.' },
  thigh_inner: { title: '허벅지 안쪽', note: null },
};

export function target_definition(target) {
  const definition = target_definitions.get(target.subarea_id);
  return {
    selection_kind: 'muscle', map_precision: target.atlas_muscle_ids?.length ? 'exact' : 'none',
    parent_subarea_ids: [], is_training_target: false, map_selectable: false, ...target, ...(definition || {}),
    // An older server may still return a reference in its original category.
    target_area: target.target_area,
  };
}

export function selectable_targets(catalog, target_area) {
  return catalog.filter((target) => target.target_area === target_area).map(target_definition)
    .filter((target) => target.is_training_target);
}

export function normalize_selected_ids(selected_ids, catalog) {
  const available_by_id = new Map(catalog.map((target) => [target.subarea_id, target_definition(target)]));
  const normalized_ids = [...new Set(selected_ids.map((subarea_id) => {
    const source = available_by_id.get(subarea_id);
    const destination = available_by_id.get(source?.training_target_id);
    return destination?.is_training_target && destination.target_area === source.target_area ? destination.subarea_id : subarea_id;
  }))];
  const parent_ids = new Set(normalized_ids.flatMap((subarea_id) => available_by_id.get(subarea_id)?.parent_subarea_ids || []));
  return normalized_ids.filter((subarea_id) => !parent_ids.has(subarea_id));
}

export function primary_muscle_target(targets, muscle_id) {
  return targets.filter((target) => target.is_training_target && target.map_selectable
    && target.atlas_muscle_ids.includes(muscle_id))
    .sort((first, second) => Number(second.subarea_id === muscle_id) - Number(first.subarea_id === muscle_id)
      || first.atlas_muscle_ids.length - second.atlas_muscle_ids.length)[0];
}

export function targets_conflict(first, second) {
  if (first.subarea_id === second.subarea_id) return true;
  if (first.parent_subarea_ids?.includes(second.subarea_id) || second.parent_subarea_ids?.includes(first.subarea_id)) return true;
  if ((first.canonical_subarea_id || first.subarea_id) === (second.canonical_subarea_id || second.subarea_id)) return true;
  // Shared artwork does not mean two workout emphasis targets are the same.
  return false;
}

export function toggle_target_selection(selected_ids, subarea_id, targets) {
  const targets_by_id = new Map(targets.map((target) => [target.subarea_id, target_definition(target)]));
  const target = targets_by_id.get(subarea_id);
  if (!target?.is_training_target) return selected_ids;
  if (selected_ids.includes(subarea_id)) return selected_ids.filter((selected_id) => selected_id !== subarea_id);
  return [...selected_ids.filter((selected_id) => {
    const selected_target = targets_by_id.get(selected_id);
    return selected_target && !targets_conflict(target, selected_target);
  }), subarea_id];
}

export function toggle_muscle_selection(selected_ids, muscle_id, targets) {
  const selected_target_ids = new Set(targets.filter((target) => selected_ids.includes(target.subarea_id)
    && target_definition(target).atlas_muscle_ids.includes(muscle_id)).map((target) => target.subarea_id));
  if (selected_target_ids.size) return selected_ids.filter((subarea_id) => !selected_target_ids.has(subarea_id));
  const target = primary_muscle_target(targets.map(target_definition), muscle_id);
  return target ? toggle_target_selection(selected_ids, target.subarea_id, targets) : selected_ids;
}
