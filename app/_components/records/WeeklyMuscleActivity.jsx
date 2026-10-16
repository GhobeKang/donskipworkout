'use client';

import { useState } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import useApiResource from '../../_hooks/useApiResource';
import { report_today, report_week_start } from '../../_lib/reportPeriods';
import MuscleActivityReport from '../reports/MuscleActivityReport';
import RequestState from '../ui/RequestState';
import MaterialIcon from '../ui/MaterialIcon';
import InfoTooltip from '../ui/InfoTooltip';
import report_styles from '../reports/MuscleActivityReport.module.css';

export default function WeeklyMuscleActivity({ revision, on_unauthorized, timezone, initial_workout_date }) {
  const { t } = useLanguage();
  const today = report_today(timezone);
  const current_week = report_week_start(today);
  const [selection, set_selection] = useState(() => ({ week_start: report_week_start(initial_workout_date || today), retry_count: 0 }));
  const activity = useApiResource(`/muscle-activity?start_date=${selection.week_start}`, `${revision}:${selection.retry_count}`, on_unauthorized);
  const change_week = (offset) => {
    const next_week = new Date(`${selection.week_start}T00:00:00Z`);
    next_week.setUTCDate(next_week.getUTCDate() + offset * 7);
    set_selection({ week_start: next_week.toISOString().slice(0, 10), retry_count: 0 });
  };

  return <section>
    <header className={report_styles.weekPicker}>
      <h2>{t('주간 근육 활동')}<InfoTooltip label={t('주간 근육 활동')}>{t('월요일부터 일요일까지 · 진행 중인 주는 오늘까지 집계합니다.')}</InfoTooltip></h2>
      <div className={report_styles.weekControls}>
        <button type="button" aria-label={t('이전 주')} disabled={selection.week_start <= '2000-01-03'} onClick={() => change_week(-1)}><MaterialIcon>chevron_left</MaterialIcon></button>
        <label><span className="srOnly">{t('조회 주의 날짜')}</span><input type="date" min="2000-01-03" max={today} value={selection.week_start} onChange={(event) => { if (event.target.value) set_selection({ week_start: report_week_start(event.target.value), retry_count: 0 }); }} /></label>
        <button type="button" aria-label={t('다음 주')} disabled={selection.week_start >= current_week} onClick={() => change_week(1)}><MaterialIcon>chevron_right</MaterialIcon></button>
      </div>
    </header>
    <RequestState loading={activity.loading} error={activity.error} on_retry={selection.retry_count < 2 ? () => set_selection((current_selection) => ({ ...current_selection, retry_count: current_selection.retry_count + 1 })) : undefined} />
    {activity.data && !activity.error && !activity.loading && <MuscleActivityReport activity={activity.data} title="주간 근육 활동" />}
  </section>;
}
