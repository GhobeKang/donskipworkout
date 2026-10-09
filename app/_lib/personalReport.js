import { format_workout_date, translate } from './i18n';
import { personal_report_changes } from './reportVisibility';

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
  const { recent, journey, consistency, recovery, challenges, preferences } = insights;
  const challenge_parts = [
    challenges.new_areas.length && t('첫 부위 {0}', [challenges.new_areas.length]),
    challenges.personal_record_areas.length && t('기록 경신 {0}부위', [challenges.personal_record_areas.length]),
  ].filter(Boolean);
  const metrics = [
    recent.comparisons.length && { key: 'recent', label: t('부위별 운동량 변화'), value: t('변화 {0}부위', [recent.comparisons.length]) },
    journey.comparisons.length && { key: 'journey', label: t('첫 기록 기간과 비교'), value: t('변화 {0}부위', [journey.comparisons.length]) },
    recovery.events.length && { key: 'recovery', label: t('다시 돌아오는 힘'), value: t('복귀 달성 {0}번', [recovery.events.length]) },
    challenge_parts.length && { key: 'challenges', label: t('새로운 도전'), value: challenge_parts.join(' · ') },
    consistency.weeks.length && { key: 'consistency', label: t('쌓아온 꾸준함'), value: t('변화가 확인된 약속 {0}주', [consistency.weeks.length]) },
    preferences.length && { key: 'preferences', label: t('나만의 운동 취향'), value: t('변화 {0}부위', [preferences.length]) },
  ].filter(Boolean);
  const comparisons = recent.comparisons.length ? recent.comparisons : journey.comparisons;
  const has_increase = comparisons.some((item) => ['improved', 'mixed'].includes(item.direction));
  const has_decrease = comparisons.some((item) => ['declined', 'mixed'].includes(item.direction));
  const title_message = !metrics.length ? '표시할 수 있는 변화가 없습니다.'
    : has_increase && has_decrease ? '운동량이 늘어난 부분과 줄어든 부분이 있어요.'
      : has_increase ? '기록에서 운동량이 늘어난 부분을 확인했어요.'
        : has_decrease ? '기록에서 운동량이 줄어든 부분을 확인했어요.'
          : '기록에서 확인된 변화를 모았어요.';
  return {
    title: t(title_message), insights, metrics,
    focus: has_decrease ? t('운동량이 줄어든 부위의 기록과 계획을 확인하세요. 운동량 감소가 운동 능력 저하를 뜻하지는 않아요.') : null,
    comparison_period: recent.comparisons.length || preferences.length
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
    t(report_status(report)), '', copy.title];
  if (copy.comparison_period) lines.push(t('최근 비교 기간: {0}', [copy.comparison_period]));
  if (copy.focus) lines.push('', t('다음에 집중할 점'), copy.focus);
  for (const metric of copy.metrics) {
    lines.push('', metric.label, metric.value);
    if (['recent', 'journey'].includes(metric.key)) {
      if (metric.key === 'journey') lines.push(t('첫 기록 기간: {0} — {1}', [insights.journey.baseline_start, insights.journey.baseline_end]));
      for (const item of insights[metric.key].comparisons) lines.push(`${t(item.target_area)} | ${comparison_text(item, language)}`);
    } else if (metric.key === 'recovery') {
      for (const event of insights.recovery.events) lines.push(`${event.missed_week} → ${event.return_week} | ${t('복귀 달성')} | ${t('첫 복귀일: {0}', [event.first_return_date])}`);
    } else if (metric.key === 'challenges') {
      for (const area of insights.challenges.new_areas) lines.push(`${t('첫 도전')} | ${t(area.target_area)} | ${area.first_date}`);
      for (const area of insights.challenges.personal_record_areas) lines.push(`${t(area.target_area)} | ${t('개인 기록을 경신한 종목 {0}개', [area.record_count])}`);
    } else if (metric.key === 'consistency') {
      for (const week of insights.consistency.weeks) lines.push(`${week.previous.week_start} → ${week.week_start} | ${t('완료 {0}/{1}회 → {2}/{3}회', [week.previous.completed_count, week.previous.target_count, week.completed_count, week.target_count])}`);
    } else if (metric.key === 'preferences') {
      for (const item of insights.preferences) lines.push(`${t(item.target_area)} | ${preference_text(item, language)}`);
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
  recent: '부위별 운동일·세트·반복 수와 총중량(중량 × 반복 수)을 비교하고, 두 기간에 기록이 있는 수치 중 달라진 값만 표시합니다.',
  journey: '첫 운동이 기록된 주 또는 월과 선택한 기간을 비교합니다. 첫 기간은 기록을 시작한 시점에 따라 불완전할 수 있습니다.',
  recovery: '복귀는 목표를 놓친 뒤 다음 약속 주의 목표를 채우고, 선택 기간에 실제 복귀한 날짜가 확인된 경우입니다.',
  challenges: '개인 기록은 선택 기간 이전의 같은 종목·중량 또는 반복 수 조건에서 최고 기록을 넘긴 경우만 부위별로 집계합니다.',
  consistency: '완료된 두 약속 주의 출석이나 달성 여부가 달라진 경우만 표시합니다. 진행 중인 주는 평가에서 제외합니다.',
  preferences: '운동 취향은 세트를 기록한 운동일 중 해당 부위를 운동한 날의 비중입니다. 여러 부위를 운동하면 합계가 100%를 넘을 수 있습니다.',
};

function personal_report_methods(metrics) {
  if (!metrics.length) return [];
  return [
    '주간은 월요일~일요일, 월간은 1일~말일입니다. 진행 중인 기간은 직전 기간의 같은 경과 일수까지만 비교하며, 전월 말일을 넘지 않습니다.',
    ...metrics.map((metric) => method_messages[metric.key]),
    '직접 기록한 운동량의 변화이며 운동 능력의 향상이나 저하를 뜻하지 않습니다.',
  ];
}
