import { useLanguage } from '../../_hooks/useLanguage';

export default function TeamGrowthGuide({ evidence }) {
  const { t } = useLanguage();
  const { performance, consistency, recovery } = evidence;
  if (!performance) return null;
  const discussion_items = [];
  const review_count = performance.review_count;
  if (performance.mixed_count > 0) discussion_items.push({
    key: 'mixed', title: '조건별 혼합 변화',
    evidence: t('향상과 낮아진 기록이 함께 있는 {0}종목', [performance.mixed_count]),
    question: '한 종목을 하나의 결론으로 묶지 말고, 각각의 중량·반복 조건을 나눠 확인하세요.',
  });
  if (review_count > 0) discussion_items.push({
    key: 'review', title: '기록 조건 확인',
    evidence: t('낮아진 동일 조건 기록 {0}종목', [review_count]),
    question: '비교 날짜의 세트·중량·반복을 확인하고, 기록 조건이 달라졌는지 멤버와 확인하세요.',
  });
  if (performance.improved_count > 0) discussion_items.push({
    key: 'improvement', title: '향상 확인',
    evidence: t('향상 기록 {0}종목 · 반복 확인 {1}종목', [performance.improved_count, performance.repeated_improved_count]),
    question: '반복 확인된 향상과 한 번 관찰된 향상을 구분하고, 다음 비교에서도 같은 조건의 기록을 확인하세요.',
  });
  if (performance.maintained_count > 0) discussion_items.push({
    key: 'maintenance', title: '유지와 다음 목표',
    evidence: t('수행 유지 {0}종목 · 반복 확인 {1}종목', [performance.maintained_count, performance.repeated_maintained_count]),
    question: '유지 기록을 인정하고, 멤버가 다음에 바꾸고 싶은 종목·중량·반복을 함께 정하세요.',
  });
  if (consistency?.period_evaluated_weeks > 0 && consistency.period_kept_weeks < consistency.period_evaluated_weeks) discussion_items.push({
    key: 'goals', title: '실행 가능한 목표',
    evidence: t('기간 내 목표 {0}/{1}주 달성', [consistency.period_kept_weeks, consistency.period_evaluated_weeks]),
    question: '미달한 주의 목표와 실제 운동일을 비교하고, 다음 주에 실행 가능한 일정인지 논의하세요.',
  });
  if (recovery?.recovered_count > 0) discussion_items.push({
    key: 'return', title: '복귀 이후 유지',
    evidence: t('목표 미달 후 복귀 달성 {0}번', [recovery.recovered_count]),
    question: '복귀한 주의 목표와 출석 기록을 확인하고, 다음 목표 주에도 이어갈 방법을 함께 정하세요.',
  });
  if (performance.uncomparable_count > 0 || !performance.comparable_count) discussion_items.push({
    key: 'baseline', title: '비교 기준 확보',
    evidence: t('비교 자료 부족 {0}종목', [performance.uncomparable_count]),
    question: '이전·현재 기록이 모두 있는지 확인하고, 같은 종목의 중량과 반복 수를 기록하도록 안내하세요.',
  });
  return <section className="teamGrowthGuide" aria-label={t('성장 방향 논의')}>
    <h4>{t('성장 방향 논의')}</h4>
    <p className="infoText">{t('아래 항목은 기록에 근거한 논의 주제입니다. 최종 성장 방향은 방장이 멤버와 정합니다.')}</p>
    <ul>{discussion_items.map((item) => <li key={item.key}><strong>{t(item.title)}</strong><span>{item.evidence}</span><p>{t(item.question)}</p></li>)}</ul>
    <p className="infoText">{t('자세·가동 범위·운동 강도와 변화의 원인은 기록만으로 단정할 수 없습니다.')}</p>
  </section>;
}
