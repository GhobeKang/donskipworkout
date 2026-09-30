import { exercise_label, format_workout_date, translate } from './i18n';

const profile_messages = {
  no_activity: '이번 기간의 기록을 기다리고 있어요.',
  mixed_progress: '좋아진 기록과 낮아진 기록이 함께 있어요.',
  review_conditions: '비교 기록이 낮아졌어요. 조건부터 확인해요.',
  returning: '멈춘 다음, 다시 돌아왔어요.',
  consistent_progress: '꾸준함이 기록의 변화로 이어졌어요.',
  progressing: '지난번의 기록을 넘어섰어요.',
  consistent: '내 약속을 이어가는 힘이 보여요.',
  exploring: '새로운 운동의 첫 기록을 만들었어요.',
  maintaining: '비교 가능한 기록을 유지했어요.',
  building_baseline: '나를 비교할 기준을 쌓고 있어요.',
};
const focus_messages = {
  log_comparable_sets: '다음 운동에서는 익숙한 종목의 중량과 반복 수를 남겨 비교 기준을 이어가세요.',
  review_comparison: '낮아진 기록의 날짜와 조건을 확인하세요. 기록만으로 컨디션이나 운동 능력 저하를 단정할 수는 없어요.',
  keep_next_promise: '운동 횟수를 더 늘리기보다, 다음에 정한 약속부터 이어가세요.',
  maintain_own_pace: '지금의 약속과 기록 습관을 이어가세요. 매주 개인 기록을 경신할 필요는 없어요.',
};

export function comparison_text(item, language) {
  const t = (message, values = []) => translate(message, values, language);
  const condition = item.dimension === 'reps' ? t('동일 중량 {0}kg', [item.condition_value]) : t('동일 반복 {0}회', [item.condition_value]);
  const change = item.dimension === 'reps'
    ? t('{0} → {1}회', [item.previous_value, item.current_value])
    : t('{0} → {1}kg', [item.previous_value, item.current_value]);
  return `${condition} · ${change}`;
}

export function personal_report_copy(report, language) {
  const t = (message, values = []) => translate(message, values, language);
  const insights = report.insights;
  const { recent, journey, consistency, recovery, challenges, preferences, coverage, evaluation } = insights;
  const no_comparison = t('비교 기록 부족');
  const evidence_messages = {
    recent_improvement: t('지난 기간 대비 {0}종목에서 기록이 향상됐어요.', [recent.improved_count]),
    recent_decline: t('{0}종목에서는 낮아진 비교 기록도 있어요.', [recent.declined_count]),
    long_term_improvement: t('첫 기록 대비 {0}종목에서 변화가 확인돼요.', [journey.improved_count]),
    consistent_weeks: t('평가가 끝난 약속 주를 {0}주 연속 지켰어요.', [consistency.current_streak]),
    returned_after_miss: t('목표를 놓친 주 이후, 다음 약속 주에 운동 기록을 남겼어요.'),
    personal_record: t('{0}종목에서 과거 최고 기록을 넘어섰어요.', [challenges.record_exercise_count]),
    new_exercise: t('{0}종목의 첫 기록을 만들었어요.', [challenges.new_exercises.length]),
    incomplete_comparison: t('{0}종목은 같은 조건의 비교 기록이 부족해요.', [recent.uncomparable_count]),
  };
  const favorite = preferences.find((item) => item.session_count > 0);
  const metrics = [
    { key: 'recent', label: t('최근 기록 변화'), value: recent.comparable_count ? t('향상 {0} · 감소 {1}', [recent.improved_count, recent.declined_count]) : no_comparison },
    { key: 'journey', label: t('시작과 지금의 거리'), value: journey.comparable_count ? t('첫 기록보다 향상 {0}종목', [journey.improved_count]) : no_comparison },
    { key: 'recovery', label: t('다시 돌아오는 힘'), value: recovery.opportunity_count ? t('{0} / {1}번 복귀 달성', [recovery.recovered_count, recovery.opportunity_count]) : t('평가할 복귀 기회 없음') },
    { key: 'challenges', label: t('새로운 도전'), value: t('첫 도전 {0} · 개인 기록 {1}', [challenges.new_exercises.length, challenges.record_exercise_count]) },
    { key: 'consistency', label: t('쌓아온 꾸준함'), value: consistency.evaluated_weeks ? t('연속 {0}주 · 누적 {1}주', [consistency.current_streak, consistency.kept_weeks]) : t('완료된 약속 주 없음') },
    { key: 'preferences', label: t('나만의 운동 취향'), value: favorite ? exercise_label(favorite, language) : t('종목 기록 없음') },
  ];
  return {
    title: t(profile_messages[evaluation.profile] || profile_messages.building_baseline),
    evidence: evaluation.evidence_codes.map((code) => evidence_messages[code]).filter(Boolean),
    focus: t(focus_messages[evaluation.focus_code]), metrics,
    commitment: report.promise_percent === null
      ? t('이번 기간 완료 {0}회 · 약속 평가는 준비 중 또는 목표 없음', [report.completed_count])
      : t('내 약속 {0} / {1}회 · 달성 {2}% · 추가 운동 +{3}회', [report.completed_count, report.target_count, report.promise_percent, report.extra_count]),
    coverage: t('완료 {0}회 중 세트 기록 {1}회 · 최근 비교 가능 {2} / {3}종목', [coverage.completed_count, coverage.recorded_count, recent.comparable_count, recent.exercise_count]),
    comparison_period: `${format_workout_date(insights.comparison_start, language)} — ${format_workout_date(insights.comparison_end, language)}`,
  };
}

export function create_report_document(report, language) {
  const t = (message, values = []) => translate(message, values, language);
  const copy = personal_report_copy(report, language);
  const insights = report.insights;
  const lines = ["DON'T SKIP · " + t('나의 변화 리포트'),
    `${report.week_start} — ${report.week_end}`, t('기준일: {0}', [report.as_of_date]),
    t(report.is_current_week ? '진행 중인 리포트' : '완료된 주간 리포트'),
    t('최근 비교 기간: {0}', [copy.comparison_period]), '', copy.title, copy.coverage, copy.commitment,
    ...copy.evidence.map((message) => `• ${message}`), '', t('다음에 집중할 점'), copy.focus, ''];
  const append_comparisons = (items) => {
    if (!items.length) lines.push(t('같은 조건의 비교 기록이 없어요.'));
    for (const item of items) lines.push(`${exercise_label(item, language)} | ${comparison_text(item, language)} | ${item.previous_date} → ${item.current_date}`);
  };
  lines.push(copy.metrics[0].label, copy.metrics[0].value);
  append_comparisons(insights.recent.comparisons);
  lines.push('', copy.metrics[1].label, copy.metrics[1].value);
  append_comparisons(insights.journey.comparisons);
  lines.push('', copy.metrics[2].label, copy.metrics[2].value);
  const event_labels = { recovered: '복귀 달성', pending: '진행 중', not_recovered: '다음 약속도 미달' };
  for (const event of insights.recovery.events) lines.push(`${event.missed_week} → ${event.return_week} | ${t(event_labels[event.status])} | ${t('첫 복귀일: {0}', [event.first_return_date || '—'])}`);
  lines.push('', copy.metrics[3].label, copy.metrics[3].value);
  for (const exercise of insights.challenges.new_exercises) lines.push(`${t('첫 도전')} | ${exercise_label(exercise, language)} | ${exercise.first_date}`);
  append_comparisons(insights.challenges.personal_records);
  lines.push('', copy.metrics[4].label, copy.metrics[4].value, t('최장 연속 {0}주 · 평가한 약속 {1}주', [insights.consistency.longest_streak, insights.consistency.evaluated_weeks]));
  const week_labels = { kept: '지킴', missed: '미달', rest: '목표 없는 주', unknown: '목표 이력 없음', in_progress: '진행 중' };
  for (const week of insights.consistency.weeks) lines.push(`${week.week_start} | ${t(week_labels[week.status])} | ${week.completed_count} / ${week.target_count ?? '—'}`);
  lines.push('', copy.metrics[5].label);
  for (const item of insights.preferences) lines.push(`${exercise_label(item, language)} | ${t('운동한 날 {0} → {1}회', [item.previous_session_count, item.session_count])} | ${t('기록한 운동 중 비중')} ${item.previous_session_percent ?? '—'}% → ${item.session_percent ?? '—'}%`);
  lines.push('', ...report_method_messages.map((message) => t(message)),
    t('비교에서 제외된 삭제 종목 세트: {0}', [insights.coverage.excluded_set_count]),
    `Method: ${insights.evaluation.method_version}`);
  const text = lines.join('\n');
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), base64: btoa(binary) };
}

export const report_method_messages = [
  '최근 변화는 지난주의 같은 요일까지 비교합니다. 진행 중인 주는 결산이 아닙니다.',
  '중량이 같으면 최고 반복 수, 반복 수가 같으면 최고 중량을 비교합니다. 한 종목에 향상과 감소가 함께 있을 수 있어요.',
  '시작과 지금은 종목별 첫 운동일과 마지막 운동일을 비교합니다. 둘의 조건이 다르면 추정하지 않아요.',
  '개인 기록은 이번 주 이전에 저장된 같은 조건의 최고 기록을 넘긴 경우입니다. 처음 기록한 조건은 개인 기록으로 세지 않아요.',
  '복귀는 목표 미달 주 이후 다음 약속 주의 목표를 채웠는지 평가합니다. 진행 중인 주는 성공·실패에서 제외합니다.',
  '꾸준함과 복귀는 목표 이력이 있는 최근 최대 53주 기준입니다. 목표 없는 휴식 주는 연속 기록을 잠시 멈추고, 이력이 없으면 연결하지 않아요.',
  '운동 취향은 세트 수가 아닌 해당 종목을 운동한 날의 비중입니다. 한 날에 여러 종목을 하면 비중 합계가 100%를 넘을 수 있어요.',
  '종합 평가는 확인된 변화·복귀·꾸준함·도전을 조합한 규칙 기반 해석입니다. 체력 점수나 다른 사용자와의 순위가 아니에요.',
  '최근 기록에 감소가 있으면 혼합 변화 또는 조건 확인을 우선 표시합니다. 그다음 복귀, 향상과 3주 이상 연속 약속 달성, 향상, 꾸준함, 첫 도전, 유지 순서로 해석합니다.',
  '완료한 운동과 직접 입력한 기록만 사용합니다. 삭제된 종목, 기록하지 않은 운동, 감정과 컨디션은 추정하지 않아요.',
];
