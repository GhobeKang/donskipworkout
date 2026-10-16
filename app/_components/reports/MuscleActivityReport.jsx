'use client';

import { lazy, Suspense, useId } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import { exercise_label } from '../../_lib/i18n';
import { report_area_label } from '../../_lib/exerciseClassification';
import { muscle_activity_method, target_muscle_rule } from '../../_lib/anatomy/muscleActivity';
import report_styles from './MuscleActivityReport.module.css';
import InfoTooltip from '../ui/InfoTooltip';

const MuscleActivityMap = lazy(() => import('../anatomy/MuscleActivityMap'));

export default function MuscleActivityReport({ activity, title = '근육 활동 기록' }) {
  const { t, language } = useLanguage();
  const report_id = useId();
  if (!activity?.current) return null;
  const { current, previous } = activity;
  const unmapped_sets = current.targets.filter((target) => !target_muscle_rule(target))
    .reduce((total, target) => total + target.set_count, 0);
  const target_label = (target) => report_area_label([target.target_area, target.target_subarea].filter(Boolean).join(' · '), language);

  return <section className={report_styles.report} aria-labelledby={`${report_id}-title`}>
    <header className={report_styles.heading}>
      <p className={report_styles.kicker}>{t('기록 기반 활동')}</p>
      <h3 id={`${report_id}-title`}>{t(title)}<InfoTooltip label={t(title)}><span className="infoTooltipParagraph">{t(muscle_activity_method)}</span><span className="infoTooltipParagraph">{t('출석 상태와 별개로 저장한 세트를 집계합니다. 색상은 활동지수를 기준으로 자동 표시합니다.')}</span>{unmapped_sets > 0 && <span className="infoTooltipParagraph">{t('분류 미설정 또는 지도에 없는 부위 {0}세트는 총계와 표에 포함하고 지도에는 표시하지 않습니다.', [unmapped_sets])}</span>}</InfoTooltip></h3>
      <p>{current.start_date} — {current.end_date} · {t('세트 기록 {0}일', [current.recorded_day_count])}</p>
    </header>
    <dl className={report_styles.totals}>
      {[['exercise_count', '운동 종목'], ['set_count', '총 세트'], ['activity_score', '활동지수']].map(([field, label]) => <div key={field}><dt>{t(label)}</dt><dd>{current[field]}</dd></div>)}
    </dl>
    {previous && <p className={report_styles.comparison}>{t('이전 비교 기간 {0} — {1}: {2}종목 · {3}세트 · 활동지수 {4}', [previous.start_date, previous.end_date, previous.exercise_count, previous.set_count, previous.activity_score])}</p>}
    <Suspense fallback={<p role="status">{t('근육 지도를 불러오는 중…')}</p>}><MuscleActivityMap summary={current} /></Suspense>
    {!current.set_count && <p className={report_styles.empty}>{t('이 기간에 저장된 운동 세트가 없습니다.')}</p>}
    {current.targets.length > 0 && <div className={report_styles.tableWrap}>
      <table className={report_styles.table}>
        <caption>{t('부위 분류별 운동 기록')}</caption>
        <thead><tr><th scope="col">{t('타겟 부위')}</th><th scope="col">{t('종목')}</th><th scope="col">{t('세트')}</th><th scope="col">{t('지수')}</th></tr></thead>
        <tbody>{current.targets.map((target, target_index) => <tr key={target_index}><th scope="row">{target_label(target)}{!target_muscle_rule(target) ? <small>{t('지도 표시 제외')}</small> : target_muscle_rule(target).is_coarse && <small>{t('큰 부위·근육군 분류')}</small>}</th><td>{target.exercise_count}</td><td>{target.set_count}</td><td>{target.activity_score}</td></tr>)}</tbody>
      </table>
    </div>}
    {current.targets.length > 0 && <details className={report_styles.evidence}>
      <summary>{t('종목별 집계 근거')}</summary>
      {current.targets.map((target, target_index) => <section key={target_index}>
        <h4>{target_label(target)}</h4>
        <p>{target.workout_dates.join(' · ')}</p>
        <ul>{target.exercises.map((exercise) => <li key={exercise.exercise_key}><span>{exercise_label(exercise, language)}{exercise.exercise_id === null && <small>{t('삭제한 종목')}</small>}</span><strong>{exercise.set_count}{t('세트')}</strong></li>)}</ul>
      </section>)}
    </details>}
  </section>;
}
