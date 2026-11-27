import { target_definition } from './exerciseTargets';

export const muscle_activity_method = '활동지수 = 기록한 훈련부하 ÷ 비교 기준 부하 × 100. 기준은 직전 최대 4주의 기록이며, 훈련부하는 세트별 환산 중량 × 반복 수의 합입니다. 실제 근육 활성화나 운동 효과를 측정한 값은 아닙니다.';
export const training_load_bands = [
  { minimum: 0, maximum: 1000, color: '#f5c99b', label: '0 초과–1,000 미만' },
  { minimum: 1000, maximum: 5000, color: '#ed9961', label: '1,000–5,000 미만' },
  { minimum: 5000, maximum: 10000, color: '#d96532', label: '5,000–10,000 미만' },
  { minimum: 10000, maximum: Infinity, color: '#ad401e', label: '10,000 이상' },
];

const score_status_messages = {
  insufficient_history: '이전 기록 없음',
  no_baseline: '기준 부하 없음',
  incomplete_load_data: '체중 기록 부족',
};

export function activity_number(value, maximum_fraction_digits = 4) {
  return Number.isFinite(value) ? new Intl.NumberFormat('en-US', {
    maximumFractionDigits: maximum_fraction_digits,
  }).format(value) : '—';
}

export function activity_score_text(activity, translate_message) {
  return activity?.score_status === 'comparable' && Number.isFinite(activity.reference_volume_kg)
    && Number.isFinite(activity.activity_score)
    ? activity_number(activity.activity_score, 1)
    : translate_message(score_status_messages[activity?.score_status] || '비교 자료 부족');
}

export function activity_volume_text(volume_kg, translate_message) {
  return translate_message('{0}kg·회', [activity_number(volume_kg)]);
}

export function activity_baseline_notice(summary, translate_message) {
  return summary?.baseline_day_count > 0 && summary.baseline_day_count < 28
    ? translate_message('임시 기준 · 과거 {0}일 기록으로 계산했습니다. 4주보다 짧아 지수가 크게 달라질 수 있습니다.', [summary.baseline_day_count])
    : null;
}

export function activity_calculation_lines(activity, translate_message) {
  if (!Number.isFinite(activity?.reference_volume_kg)) return [translate_message('새 계산 근거를 보려면 리포트를 다시 불러오세요.')];
  const lines = [translate_message('현재 훈련부하 {0} · 비교 기준 부하 {1}', [
    activity_volume_text(activity.volume_kg, translate_message),
    activity_volume_text(activity.reference_volume_kg, translate_message),
  ])];
  if (activity.score_status === 'comparable') {
    lines.push(translate_message('계산식: {0} ÷ {1} × 100 = {2}', [
      activity_number(activity.volume_kg), activity_number(activity.reference_volume_kg),
      activity_score_text(activity, translate_message),
    ]));
  } else lines.push(activity_score_text(activity, translate_message));
  if (activity.excluded_set_count || activity.baseline_excluded_set_count) {
    lines.push(translate_message('체중 정보가 없어 부하에서 제외한 세트: 현재 {0}세트 · 기준 기간 {1}세트', [
      activity.excluded_set_count, activity.baseline_excluded_set_count,
    ]));
  }
  return lines;
}

export function muscle_activity_reference_lines(summary, translate_message) {
  if (summary?.score_method !== 'four_week_volume_v1') return [translate_message('새 계산 근거를 보려면 리포트를 다시 불러오세요.')];
  const baseline_notice = activity_baseline_notice(summary, translate_message);
  const reference_lines = summary.baseline_day_count === 0 ? [translate_message('보고 기간 이전에 비교할 운동 기록이 없습니다. 현재 기록은 다음 기간부터 기준에 반영됩니다.')]
    : [
      translate_message('기준 기록 기간: {0} — {1}', [summary.baseline_start_date, summary.baseline_end_date]),
      ...(baseline_notice ? [baseline_notice] : []),
      translate_message(summary.period_type === 'monthly'
        ? '월간 기준 부하 = 기준 기간 부하 ÷ 실제 기준 일수 × 집계 일수. 진행 중인 달은 오늘까지 계산합니다.'
        : summary.baseline_sampling_method === 'daily_average'
          ? '같은 요일의 과거 기록 기간이 없어, 확보한 기준 기간의 일평균 부하 × 집계 일수로 계산합니다.'
          : '주간 기준 부하 = 기준 기간 중 같은 요일의 부하 ÷ 해당 요일의 실제 일수 × 집계 일수입니다.'),
      translate_message('기준 기간 전체 부하 {0} · 비교에 사용한 부하 {1} ÷ {2}일 × {3}일', [
        activity_volume_text(summary.baseline_volume_kg, translate_message),
        activity_volume_text(summary.baseline_matched_volume_kg, translate_message),
        summary.baseline_sample_day_count, summary.period_day_count,
      ]),
    ];
  return [
    ...reference_lines,
    ...activity_calculation_lines(summary, translate_message),
    translate_message('100은 비교 기준과 같은 훈련부하입니다. 120은 기준보다 20% 많은 기록량이며, 운동 효과의 우열을 뜻하지 않습니다.'),
    translate_message('기준 기간은 첫 세트 기록일부터 보고 기간 직전까지 최대 28일입니다. 기록이 없는 날도 평균에 포함합니다.'),
    translate_message('복근 0kg 세트는 실제 중량 대신 계산 기준 1kg × 반복 수로 집계합니다. 다른 부위의 0kg은 훈련부하에서 제외하며 세트·반복 수에만 포함합니다. 음수는 체중에서 보조중량을 뺀 값(최소 0kg)으로 계산합니다.'),
    translate_message('보조 운동은 기록 당시 체중을 우선하며, 없으면 설정의 현재 체중으로 추정합니다. 두 체중 모두 없을 때만 해당 세트의 부하를 계산할 수 없습니다.'),
    translate_message('종목이나 기구 구성이 달라지면 부하의 의미도 달라질 수 있습니다. 부위별 지수끼리 더하거나 운동 효과로 해석하지 마세요.'),
  ];
}

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
  const definition = target_definition(target);
  if (Array.isArray(definition.atlas_muscle_ids)) {
    return definition.atlas_muscle_ids.length ? {
      muscle_ids: definition.atlas_muscle_ids,
      is_coarse: definition.map_precision !== 'exact' || ['muscle_group', 'training_group', 'focus'].includes(definition.selection_kind),
    } : null;
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

export function training_load_color(volume_kg) {
  if (!Number.isFinite(volume_kg) || volume_kg <= 0) return undefined;
  return training_load_bands.find((band) => volume_kg >= band.minimum && volume_kg < band.maximum)?.color;
}

export function activity_for_muscles(summary, muscles) {
  const activity_by_muscle = {};
  for (const muscle of muscles) {
    const targets = (summary?.targets || []).filter((target) => {
      const rule = target_muscle_rule(target);
      return rule?.muscle_ids?.includes(muscle.id) || rule?.prefixes?.some((prefix) => muscle.id.startsWith(prefix));
    });
    if (!targets.length) continue;
    const records_by_exercise = new Map();
    targets.forEach((target) => target.exercises.forEach((exercise) => {
      records_by_exercise.set(exercise.exercise_key, exercise);
    }));
    const exercises = [...records_by_exercise.values()];
    const totals = Object.fromEntries([
      'set_count', 'volume_kg', 'reference_volume_kg', 'excluded_set_count',
      'baseline_set_count', 'baseline_volume_kg', 'baseline_excluded_set_count',
      'baseline_matched_volume_kg', 'baseline_matched_excluded_set_count',
    ].map((field) => [field, exercises.reduce((total, exercise) => total + (exercise[field] || 0), 0)]));
    const score_status = summary?.score_method !== 'four_week_volume_v1' ? 'unavailable'
      : totals.excluded_set_count || totals.baseline_matched_excluded_set_count ? 'incomplete_load_data'
      : !summary.baseline_history_complete && !(summary.baseline_day_count > 0) ? 'insufficient_history'
      : totals.reference_volume_kg <= 0 ? 'no_baseline' : 'comparable';
    activity_by_muscle[muscle.id] = {
      ...totals, targets, score_status,
      exercise_count: exercises.filter((exercise) => exercise.set_count > 0).length,
      activity_score: score_status === 'comparable'
        ? Math.round(totals.volume_kg / totals.reference_volume_kg * 1000 + 1e-9) / 10 : null,
      is_coarse: targets.some((target) => target_muscle_rule(target).is_coarse),
    };
  }
  return activity_by_muscle;
}

export function muscle_activity_value(summary, translate_message, baseline_summary = summary) {
  const activity_value = translate_message('{0}종목 · {1}세트 · 활동지수 {2}', [summary.exercise_count, summary.set_count, activity_score_text(summary, translate_message)]);
  return activity_baseline_notice(baseline_summary, translate_message)
    ? translate_message('{0} · 임시 기준 {1}일', [activity_value, baseline_summary.baseline_day_count])
    : activity_value;
}
