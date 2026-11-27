'use client';

import { lazy, Suspense, useId } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import { muscle_target_label } from '../../_lib/exerciseClassification';
import { activity_baseline_notice, activity_score_text, activity_volume_text, muscle_activity_method, muscle_activity_value, target_muscle_rule } from '../../_lib/anatomy/muscleActivity';
import report_styles from './MuscleActivityReport.module.css';
import InfoTooltip from '../ui/InfoTooltip';
import MuscleActivityEvidence from './MuscleActivityEvidence';

const MuscleActivityMap = lazy(() => import('../anatomy/MuscleActivityMap'));

export default function MuscleActivityReport({ activity, title = '근육 활동 기록' }) {
  const { t, language } = useLanguage();
  const report_id = useId();
  if (!activity?.current) return null;
  const { current, previous } = activity;
  const baseline_notice = activity_baseline_notice(current, t);
  const unmapped_sets = current.targets.filter((target) => !target_muscle_rule(target))
    .reduce((total, target) => total + target.set_count, 0);
  const target_label = (target) => muscle_target_label(target, language);

  return <section className={report_styles.report} aria-labelledby={`${report_id}-title`}>
    <header className={report_styles.heading}>
      <p className={report_styles.kicker}>{t('기록 기반 활동')}</p>
      <h3 id={`${report_id}-title`}>{t(title)}<InfoTooltip label={t(title)}><span className="infoTooltipParagraph">{t(muscle_activity_method)}</span><span className="infoTooltipParagraph">{t('출석 상태와 별개로 저장한 세트를 집계합니다. 지도 색상은 선택 기간에 기록된 훈련부하(환산 중량 × 반복 수)를 기준으로 표시합니다.')}</span>{unmapped_sets > 0 && <span className="infoTooltipParagraph">{t('분류 미설정 또는 지도에 없는 부위 {0}세트는 총계와 표에 포함하고 지도에는 표시하지 않습니다.', [unmapped_sets])}</span>}</InfoTooltip></h3>
      <p>{current.start_date} — {current.end_date} · {t('세트 기록 {0}일', [current.recorded_day_count])}</p>
      <p>{t('세트는 선택된 각 부위에 반영되며, 전체 종목·세트 수에서는 한 번만 집계합니다.')}</p>
    </header>
    {baseline_notice && <p className={report_styles.method} role="note">{baseline_notice}</p>}
    <dl className={report_styles.totals}>
      {[['exercise_count', '운동 종목'], ['set_count', '총 세트'], ['activity_score', '활동지수']].map(([field, label]) => <div key={field}><dt>{t(label)}</dt><dd data-unavailable={field === 'activity_score' && current.score_status !== 'comparable' ? true : undefined}>{field === 'activity_score' ? activity_score_text(current, t) : current[field]}</dd></div>)}
    </dl>
    {current.score_method === 'four_week_volume_v1' && <p className={report_styles.method}>{t('현재 훈련부하 {0} · 비교 기준 부하 {1}', [activity_volume_text(current.volume_kg, t), activity_volume_text(current.reference_volume_kg, t)])}</p>}
    {previous && <p className={report_styles.comparison}>{t('이전 비교 기간 {0} — {1}: {2}', [previous.start_date, previous.end_date, muscle_activity_value(previous, t)])}</p>}
    <Suspense fallback={<p role="status">{t('근육 지도를 불러오는 중…')}</p>}><MuscleActivityMap summary={current} /></Suspense>
    {!current.set_count && <p className={report_styles.empty}>{t('이 기간에 저장된 운동 세트가 없습니다.')}</p>}
    {current.targets.length > 0 && <div className={report_styles.tableWrap}>
      <table className={report_styles.table}>
        <caption>{t('부위 분류별 운동 기록')}</caption>
        <thead><tr><th scope="col">{t('타겟 부위')}</th><th scope="col">{t('종목')}</th><th scope="col">{t('세트')}</th><th scope="col">{t('지수')}</th></tr></thead>
        <tbody>{current.targets.map((target, target_index) => <tr key={target_index}><th scope="row">{target_label(target)}{!target_muscle_rule(target) ? <small>{t('지도 표시 제외')}</small> : target_muscle_rule(target).is_coarse && <small>{t('근육군·강조 부위 또는 부분 표시')}</small>}</th><td>{target.exercise_count}</td><td>{target.set_count}</td><td>{activity_score_text(target, t)}</td></tr>)}</tbody>
      </table>
    </div>}
    <MuscleActivityEvidence summary={current} />
  </section>;
}
