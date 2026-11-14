import { useState } from 'react';
import useApiResource from '../../_hooks/useApiResource';
import { useLanguage } from '../../_hooks/useLanguage';
import { report_today, report_week_start, report_year } from '../../_lib/reportPeriods';
import PersonalReport from '../sharing/PersonalReport';
import ReportPeriodPicker from '../sharing/ReportPeriodPicker';
import RequestState from '../ui/RequestState';
import styles from './Mentorship.module.css';

export default function MentorReport({ relationship_uuid, timezone, on_unauthorized }) {
  const { t } = useLanguage();
  const today = report_today(timezone);
  const [selection, set_selection] = useState(() => ({ period_type: 'weekly', year: report_year('weekly', today), start_date: report_week_start(today) }));
  const [query, set_query] = useState(selection);
  const [revision, set_revision] = useState(0);
  const [retry_count, set_retry_count] = useState(0);
  const resource = useApiResource(`/mentorship/relationships/${relationship_uuid}/report?period_type=${query.period_type}&start_date=${query.start_date}`, revision, on_unauthorized);
  return <div className={styles.stack}>
    <article className={styles.card}>
      <h2>{t('회원의 운동 수행 리포트')}</h2>
      <p className={styles.muted}>{t('회원의 시간대를 기준으로 출석, 운동 수행과 이전 기간 대비 변화를 확인합니다. 기록이 바뀌면 다시 계산됩니다.')}</p>
      <fieldset className={styles.fieldset} disabled={resource.loading}>
        <ReportPeriodPicker selection={selection} today={today} on_change={set_selection} on_generate={() => { set_query({ ...selection }); set_retry_count(0); set_revision((value) => value + 1); }} />
      </fieldset>
    </article>
    <RequestState loading={resource.loading} error={resource.error} on_retry={retry_count < 2 ? () => { set_retry_count((value) => value + 1); set_revision((value) => value + 1); } : undefined} />
    {resource.data && !resource.error && !resource.loading && <PersonalReport report={resource.data} />}
  </div>;
}
