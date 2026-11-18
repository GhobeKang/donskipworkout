export const muscle_activity_method = '활동지수 = 기간 내 중복 없는 운동 종목 수 + 기록한 세트 수. 실제 근육 자극 강도를 측정한 값은 아닙니다.';
export const activity_bands = [
  { minimum: 1, maximum: 4, color: '#f5c99b', label: '1–4' },
  { minimum: 5, maximum: 9, color: '#ed9961', label: '5–9' },
  { minimum: 10, maximum: 19, color: '#d96532', label: '10–19' },
  { minimum: 20, maximum: Infinity, color: '#ad401e', label: '20+' },
];

const area_rules = {
  가슴: ['pectoralis_major'],
  등: ['latissimus_dorsi', 'trapezius_', 'infraspinatus'],
  어깨: ['anterior_deltoid', 'lateral_deltoid', 'posterior_deltoid'],
  이두: ['biceps_brachii_'],
  삼두: ['triceps_brachii_'],
  복근: ['rectus_abdominis', 'external_oblique'],
  엉덩이: ['gluteus_maximus', 'gluteus_medius'],
  허벅지: ['rectus_femoris', 'vastus_', 'biceps_femoris', 'semitendinosus', 'semimembranosus', 'adductor_', 'gracilis', 'pectineus'],
  종아리: ['gastrocnemius', 'tibialis_anterior'],
};
const detailed_rules = {
  대흉근: ['pectoralis_major'], 광배근: ['latissimus_dorsi'],
  '승모근 · 상부': ['trapezius_upper'], '승모근 · 중부': ['trapezius_middle'], '승모근 · 하부': ['trapezius_lower'],
  '전면 삼각근': ['anterior_deltoid'], '측면 삼각근': ['lateral_deltoid'], '후면 삼각근': ['posterior_deltoid'],
  '이두 장두': ['biceps_brachii_caput_longum'], '이두 단두': ['biceps_brachii_caput_breve'], 상완요골근: ['brachioradialis'],
  '삼두 장두': ['triceps_brachii_caput_longum'], '삼두 외측두': ['triceps_brachii_caput_laterale'], '삼두 내측두': ['triceps_brachii_caput_mediale'],
  대둔근: ['gluteus_maximus'], 중둔근: ['gluteus_medius'], 비복근: ['gastrocnemius'], 전경골근: ['tibialis_anterior'],
};
const grouped_rules = {
  승모근: ['trapezius_'], 상완이두근: ['biceps_brachii_'], 상완삼두근: ['triceps_brachii_'],
  '상부 등': ['trapezius_upper', 'trapezius_middle'], '중부 등': ['trapezius_middle', 'trapezius_lower'],
  // The atlas has one shape per lat: regional targets stay grouped on the map.
  '광배근 · 상부': ['latissimus_dorsi'], '광배근 · 하부': ['latissimus_dorsi'],
  윗가슴: ['pectoralis_major'], '가운데 가슴': ['pectoralis_major'], 아랫가슴: ['pectoralis_major'],
  상복부: ['rectus_abdominis'], 하복부: ['rectus_abdominis'], 복사근: ['external_oblique'],
  대퇴사두근: ['rectus_femoris', 'vastus_'], 햄스트링: ['biceps_femoris', 'semitendinosus', 'semimembranosus'],
  내전근: ['adductor_', 'gracilis', 'pectineus'],
};

export function target_muscle_rule(target) {
  if (Array.isArray(target.atlas_muscle_ids)) {
    return target.atlas_muscle_ids.length ? { muscle_ids: target.atlas_muscle_ids, is_coarse: Boolean(target.is_legacy) } : null;
  }
  // Compatibility for older saved report snapshots; current records use reference IDs.
  if (!target.target_subarea) {
    const prefixes = area_rules[target.target_area];
    return prefixes ? { prefixes, is_coarse: true } : null;
  }
  if (detailed_rules[target.target_subarea]) return { prefixes: detailed_rules[target.target_subarea], is_coarse: false };
  if (grouped_rules[target.target_subarea]) return { prefixes: grouped_rules[target.target_subarea], is_coarse: true };
  return null;
}

export function activity_color(activity_score) {
  return activity_bands.find((band) => activity_score >= band.minimum && activity_score <= band.maximum)?.color;
}

export function activity_for_muscles(summary, muscles) {
  const activity_by_muscle = {};
  for (const muscle of muscles) {
    const targets = (summary?.targets || []).filter((target) => {
      const rule = target_muscle_rule(target);
      return rule?.muscle_ids?.includes(muscle.id) || rule?.prefixes?.some((prefix) => muscle.id.startsWith(prefix));
    });
    if (!targets.length) continue;
    const sets_by_exercise = new Map();
    targets.forEach((target) => target.exercises.forEach((exercise) => {
      sets_by_exercise.set(exercise.exercise_key, Math.max(sets_by_exercise.get(exercise.exercise_key) || 0, exercise.set_count));
    }));
    const exercise_keys = new Set(sets_by_exercise.keys());
    const set_count = [...sets_by_exercise.values()].reduce((total, count) => total + count, 0);
    activity_by_muscle[muscle.id] = {
      targets, set_count, exercise_count: exercise_keys.size,
      activity_score: exercise_keys.size + set_count,
      is_coarse: targets.some((target) => target_muscle_rule(target).is_coarse),
    };
  }
  return activity_by_muscle;
}

export function muscle_activity_value(summary, translate_message) {
  return translate_message('{0}종목 · {1}세트 · 활동지수 {2}', [summary.exercise_count, summary.set_count, summary.activity_score]);
}
