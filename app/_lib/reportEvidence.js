import { translate } from './i18n';

export function performance_text(comparison, language) {
  const t = (message, values = []) => translate(message, values, language);
  return comparison.dimension === 'reps'
    ? t('동일 {0}kg · 반복 {1} → {2}회', [comparison.condition_value, comparison.previous_value, comparison.current_value])
    : t('동일 {0}회 · 중량 {1} → {2}kg', [comparison.condition_value, comparison.previous_value, comparison.current_value]);
}

export function performance_value(performance, language) {
  const t = (message, values = []) => translate(message, values, language);
  if (!performance.comparable_count) return t('동일 조건 수행 비교 자료 부족');
  return t('향상 {0} · 유지 {1} · 확인 필요 {2}종목', [
    performance.improved_count + performance.mixed_count,
    performance.maintained_count,
    performance.review_count + performance.mixed_count,
  ]);
}

export function evidence_copy(evidence, language, completed_count = 0) {
  const t = (message, values = []) => translate(message, values, language);
  const performance = evidence.performance;
  const consistency = evidence.consistency;
  const recovery = evidence.recovery;
  const has_improvement = performance && performance.improved_count + performance.mixed_count > 0;
  const has_review = performance && performance.review_count + performance.mixed_count > 0;
  const has_maintenance = performance?.maintained_count > 0;
  const has_consistency = consistency?.period_kept_weeks > 0
    || (completed_count > 0 && consistency?.current_streak >= 2);
  const title = has_improvement && has_review ? '수행 향상과 확인이 필요한 기록이 함께 있어요.'
    : has_improvement ? '같은 조건에서 수행이 향상됐어요.'
      : recovery?.recovered_count > 0 ? '다시 돌아와 운동 목표를 달성했어요.'
        : recovery?.pending_count > 0 ? '운동을 다시 시작했어요. 목표 달성은 확인 중이에요.'
          : has_review ? '같은 조건의 기록을 다시 확인해 보세요.'
            : has_maintenance ? '같은 조건의 수행을 유지하고 있어요.'
              : has_consistency ? consistency.current_streak >= 2
                ? '개인 운동 목표를 꾸준히 지켰어요.' : '개인 운동 목표를 달성했어요.'
                : completed_count > 0 ? '운동을 기록했어요. 수행 비교의 기준을 쌓고 있어요.'
                  : '선택한 기간에 완료된 운동 기록이 없어요.';
  const highlight = [...(performance?.comparisons || [])].sort((first, second) => {
    const priority = (item) => ({ improved: 0, maintained: 1, declined: 2 })[item.direction] * 2
      + (item.confirmation_days >= 2 ? 0 : 1);
    return priority(first) - priority(second);
  })[0];
  const highlights = [];
  if (highlight) highlights.push(`${highlight.exercise_name} · ${performance_text(highlight, language)} · ${t(
    highlight.confirmation_days >= 2 ? '서로 다른 운동일 {0}일에서 확인' : '한 운동일에서 관찰',
    [highlight.confirmation_days],
  )}`);
  if (has_consistency) highlights.push(consistency.current_streak >= 2
    ? t('비교 이력에서 목표 {0}주 연속 달성', [consistency.current_streak])
    : t('선택 기간의 완료된 목표 {0}/{1}주 달성', [consistency.period_kept_weeks, consistency.period_evaluated_weeks]));
  if (recovery?.recovered_count > 0) highlights.push(t('목표 미달 후 복귀 달성 {0}번', [recovery.recovered_count]));
  if (recovery?.pending_count > 0) highlights.push(t('운동 재개 {0}번 · 진행 중인 목표는 평가 전', [recovery.pending_count]));
  return {
    title: t(title), highlights, highlight,
    focus: has_review ? t('비교된 중량·반복과 기록 조건을 확인하세요. 총중량 감소만으로 수행 저하를 판단하지 않아요.')
      : performance && !performance.comparable_count && completed_count > 0
        ? t('다음 운동에서도 같은 종목의 중량과 반복 수를 기록하면 수행을 비교할 수 있어요.') : null,
  };
}
