import { format_workout_date, translate } from './i18n';
import { report_area_label } from './exerciseClassification';
import { personal_report_changes } from './reportVisibility';
import { evidence_copy, performance_text, performance_value } from './reportEvidence';
import { workout_time_method, workout_time_report_lines, workout_time_value } from './workoutTime';
import { muscle_activity_method, muscle_activity_value } from './anatomy/muscleActivity';

const comparison_messages = {
  session_count: '운동일 {0} → {1}일',
  set_count: '세트 {0} → {1}',
  rep_count: '반복 {0} → {1}회',
  volume_kg: '총중량 {0} → {1}kg',
};

export function comparison_text(item, language) {
  return item.changed_fields.map((field) => translate(comparison_messages[field], [
    item.previous[field], item.current[field],
  ], language)).join(' · ');
}

export function report_status(report) {
  return report.is_current_period ? '진행 중인 리포트'
    : report.period_type === 'monthly' ? '완료된 월간 리포트' : '완료된 주간 리포트';
}

export function personal_report_copy(report, language) {
  const t = (message, values = []) => translate(message, values, language);
  const insights = personal_report_changes(report);
  const { recent, journey, performance, journey_performance, consistency, recovery, challenges, preferences } = insights;
  const evidence = evidence_copy(insights, language, insights.coverage.completed_count);
  const challenge_parts = [
    challenges.new_areas.length && t('첫 부위 {0}', [challenges.new_areas.length]),
    challenges.personal_record_areas.length && t('기록 경신 {0}부위', [challenges.personal_record_areas.length]),
  ].filter(Boolean);
  const metrics = [
    performance && (performance.exercise_count > 0 || insights.coverage.completed_count > 0) && { key: 'performance', label: t('동일 조건의 수행 변화'), value: performance_value(performance, language) },
    insights.workout_time && { key: 'workout_time', label: t('운동 시간의 변화'), value: workout_time_value(insights.workout_time, language) },
    insights.muscle_activity && { key: 'muscle_activity', label: t('근육 활동 기록'), value: muscle_activity_value(insights.muscle_activity.current, t) },
    consistency.weeks.length || (insights.coverage.completed_count > 0 && consistency.current_streak >= 2)
      ? { key: 'consistency', label: t('지켜온 운동 목표'), value: consistency.current_streak >= 2
        ? t('목표 {0}주 연속 달성', [consistency.current_streak])
        : t('완료된 목표 {0}/{1}주 달성', [consistency.period_kept_weeks, consistency.period_evaluated_weeks]) } : null,
    recovery.events.length && { key: 'recovery', label: t('다시 돌아오는 힘'), value: t('복귀 달성 {0}번 · 운동 재개 확인 중 {1}번', [recovery.recovered_count, recovery.pending_count]) },
    journey_performance?.comparable_count > 0 && { key: 'journey_performance', label: t('첫 기록 기간 대비 수행'), value: performance_value(journey_performance, language) },
    recent.comparisons.length && { key: 'recent', label: t('부위별 운동량 변화'), value: t('변화 {0}부위', [recent.comparisons.length]) },
    journey.comparisons.length && { key: 'journey', label: t('첫 기록 기간과 비교'), value: t('변화 {0}부위', [journey.comparisons.length]) },
    challenge_parts.length && { key: 'challenges', label: t('새로운 도전'), value: challenge_parts.join(' · ') },
    preferences.length && { key: 'preferences', label: t('나만의 운동 취향'), value: t('변화 {0}부위', [preferences.length]) },
  ].filter(Boolean);
  return {
    ...evidence, insights, metrics,
    comparison_period: performance?.exercise_count || recent.comparisons.length || preferences.length || insights.workout_time
      ? `${format_workout_date(insights.comparison_start, language, { year: 'numeric', month: 'short', day: 'numeric' })} — ${format_workout_date(insights.comparison_end, language, { year: 'numeric', month: 'short', day: 'numeric' })}`
      : null,
    method_messages: personal_report_methods(metrics),
  };
}

export function create_report_document(report, language) {
  const t = (message, values = []) => translate(message, values, language);
  const copy = personal_report_copy(report, language);
  const insights = copy.insights;
  const lines = ["DON'T SKIP · " + t('나의 변화 리포트'),
    `${report.period_start} — ${report.period_end}`, t('기준일: {0}', [report.as_of_date]),
    t(report_status(report)), '', copy.title, ...copy.highlights];
  if (copy.comparison_period) lines.push(t('최근 비교 기간: {0}', [copy.comparison_period]));
  if (copy.focus) lines.push('', t('다음에 집중할 점'), copy.focus);
  for (const metric of copy.metrics) {
    lines.push('', metric.label, metric.value);
    if (['performance', 'journey_performance'].includes(metric.key)) {
      const performance = insights[metric.key];
      lines.push(t('비교 가능 {0}/{1}종목 · 비교 자료 부족 {2}종목', [performance.comparable_count, performance.exercise_count, performance.uncomparable_count]));
      for (const item of performance.comparisons) lines.push(`${item.exercise_name} | ${performance_text(item, language)} | ${item.previous_date} → ${item.current_date} | ${t('서로 다른 운동일 {0}일에서 확인', [item.confirmation_days])}`);
    } else if (metric.key === 'workout_time') {
      lines.push(...workout_time_report_lines(insights.workout_time, language));
    } else if (metric.key === 'muscle_activity') {
      const { current, previous } = insights.muscle_activity;
      lines.push(t('이전 비교 기간 {0} — {1}: {2}종목 · {3}세트 · 활동지수 {4}', [previous.start_date, previous.end_date, previous.exercise_count, previous.set_count, previous.activity_score]));
      for (const target of current.targets) {
        const target_label = report_area_label([target.target_area, target.target_subarea].filter(Boolean).join(' · '), language);
        lines.push(`${target_label} | ${muscle_activity_value(target, t)} | ${target.workout_dates.join(', ')}`);
        for (const exercise of target.exercises) lines.push(`  ${exercise.exercise_name} | ${exercise.set_count}${t('세트')}`);
      }
    } else if (['recent', 'journey'].includes(metric.key)) {
      if (metric.key === 'journey') lines.push(t('첫 기록 기간: {0} — {1}', [insights.journey.baseline_start, insights.journey.baseline_end]));
      for (const item of insights[metric.key].comparisons) lines.push(`${report_area_label(item.target_area, language)} | ${comparison_text(item, language)}`);
    } else if (metric.key === 'recovery') {
      for (const event of insights.recovery.events) lines.push(`${event.missed_week} → ${event.return_week} | ${t(event.status === 'recovered' ? '복귀 달성' : '운동 재개 · 목표 달성 확인 중')} | ${t('첫 복귀일: {0}', [event.first_return_date])}`);
    } else if (metric.key === 'challenges') {
      for (const area of insights.challenges.new_areas) lines.push(`${t('첫 도전')} | ${report_area_label(area.target_area, language)} | ${area.first_date}`);
      for (const area of insights.challenges.personal_record_areas) lines.push(`${report_area_label(area.target_area, language)} | ${t('개인 기록을 경신한 종목 {0}개', [area.record_count])}`);
    } else if (metric.key === 'consistency') {
      for (const week of insights.consistency.weeks) lines.push(`${week.week_start} | ${t('운동 {0}/{1}회 · {2}', [week.completed_count, week.target_count, t(week.status === 'kept' ? '목표 달성' : '목표 미달')])}`);
    } else if (metric.key === 'preferences') {
      for (const item of insights.preferences) lines.push(`${report_area_label(item.target_area, language)} | ${preference_text(item, language)}`);
    }
  }
  if (copy.metrics.length) lines.push('', ...copy.method_messages.map((message) => t(message)));
  const text = lines.join('\n');
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), base64: btoa(binary) };
}

export function preference_text(item, language) {
  const parts = [];
  if (item.previous_session_count !== item.session_count) parts.push(translate('운동한 날 {0} → {1}회', [item.previous_session_count, item.session_count], language));
  if (item.previous_session_percent !== item.session_percent) parts.push(translate('운동일 비중 {0}% → {1}%', [item.previous_session_percent, item.session_percent], language));
  return parts.join(' · ');
}

const method_messages = {
  workout_time: workout_time_method,
  muscle_activity: muscle_activity_method,
  performance: '같은 종목·중량에서 최고 반복 수, 같은 종목·반복 수에서 최고 중량을 비교합니다. 같은 날 여러 세트는 반복 확인 1일로 계산합니다.',
  journey_performance: '첫 기록 기간의 동일 조건 수행과 비교합니다. 초기 기록이 적거나 조건이 없으면 비교 자료 부족으로 표시합니다.',
  recent: '부위별 운동일·세트·반복 수와 총중량(중량 × 반복 수)을 비교하고, 두 기간에 기록이 있는 수치 중 달라진 값만 표시합니다.',
  journey: '첫 운동이 기록된 주 또는 월과 선택한 기간을 비교합니다. 첫 기간은 기록을 시작한 시점에 따라 불완전할 수 있습니다.',
  recovery: '목표 미달 후 다음 목표 주에 운동을 재개하면 복귀 진행 중, 완료된 주의 목표를 채우면 복귀 달성입니다. 휴식 목표 주는 건너뜁니다.',
  challenges: '개인 기록은 선택 기간 이전의 같은 종목·중량 또는 반복 수 조건에서 최고 기록을 넘긴 경우만 부위별로 집계합니다.',
  consistency: '선택 기간에 끝난 목표 주는 출석 수가 같아도 표시합니다. 연속 달성은 비교 이력 기준이며 진행 중인 주와 휴식 주는 추가하지 않습니다.',
  preferences: '운동 취향은 세트를 기록한 운동일 중 해당 부위를 운동한 날의 비중입니다. 여러 부위를 운동하면 합계가 100%를 넘을 수 있습니다.',
};

function personal_report_methods(metrics) {
  if (!metrics.length) return [];
  return [
    '주간은 월요일~일요일, 월간은 1일~말일입니다. 진행 중인 기간은 직전 기간의 같은 경과 일수까지만 비교하며, 전월 말일을 넘지 않습니다.',
    ...metrics.map((metric) => method_messages[metric.key]),
    '부위는 종목에 세부분류가 설정되어 있으면 세부분류로, 없으면 기본 분류로 집계합니다. 분류를 수정하면 기존 기록의 리포트도 다시 계산됩니다.',
    '총중량·세트·운동일의 증감은 훈련량 참고 지표입니다. 총중량 감소만으로 수행 저하를 판단하지 않습니다.',
  ];
}
