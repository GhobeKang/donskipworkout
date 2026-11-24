import { useState } from 'react';
import useApiResource from '../../_hooks/useApiResource';
import { useLanguage } from '../../_hooks/useLanguage';
import { format_workout_date } from '../../_lib/i18n';
import InfoTooltip from '../ui/InfoTooltip';
import RequestState from '../ui/RequestState';

export default function RecordStatistics({ revision, year, month, on_change_month, on_unauthorized }) {
  const { t, language } = useLanguage();
  const [selected_period, set_selected_period] = useState('all');
  const [retry_count, set_retry_count] = useState(0);
  const is_monthly = selected_period === 'monthly';
  const stats_path = is_monthly ? `/stats?year=${year}&month=${month}` : '/stats';
  const stats = useApiResource(stats_path, `${revision}:${retry_count}`, on_unauthorized);
  const month_label = format_workout_date(`${year}-${String(month).padStart(2, '0')}-01`, language, { year: 'numeric', month: 'long' });
  const period_label = is_monthly ? month_label : t('전체 기간');
  const stat_labels = { completed_count: t('운동 완료'), rest_count: t('휴식'), missed_count: t('미실행'), pending_count: t('예정 / 출발'), total_count: t('전체 기록') };
  const chart_fields = [
    { field_name: 'completed_count', label: t('완료'), color: 'done' },
    { field_name: 'rest_count', label: t('휴식'), color: 'rest' },
    { field_name: 'missed_count', label: t('미실행'), color: 'missed' },
    { field_name: 'pending_count', label: t('예정'), color: 'pending' },
  ];
  const chart_maximum = stats.data ? Math.max(1, ...chart_fields.map(({ field_name }) => stats.data[field_name])) : 1;

  return <section className="recordStatistics" aria-label={t('통계')}>
    <div className="tabs" role="group" aria-label={t('통계 기간')}>
      {[['all', '전체'], ['monthly', '월간']].map(([period, label]) => <button type="button" key={period} aria-pressed={selected_period === period} className={selected_period === period ? 'isActive' : ''} onClick={() => { set_selected_period(period); set_retry_count(0); }}>{t(label)}</button>)}
    </div>
    {is_monthly && <div className="calendarHeader">
      <button type="button" className="textButton" aria-label={t('이전 달')} disabled={year === 2000 && month === 1} onClick={() => { on_change_month(-1); set_retry_count(0); }}>‹</button>
      <strong>{month_label}</strong>
      <button type="button" className="textButton" aria-label={t('다음 달')} disabled={year === 2100 && month === 12} onClick={() => { on_change_month(1); set_retry_count(0); }}>›</button>
    </div>}
    <RequestState loading={stats.loading} error={stats.error} on_retry={retry_count < 2 ? () => set_retry_count((count) => count + 1) : undefined} />
    {stats.data && <>
      <section className="statsChartCard" aria-labelledby="stats-chart-title">
        <div className="statsChartHeading"><div><p className="cardKicker">{period_label}</p><h2 id="stats-chart-title">{t('운동 기록 분포')}<InfoTooltip label={t('운동 기록 분포')}><span className="infoTooltipParagraph">{period_label} · {t('상태별 기록 횟수 비교')}</span><span className="infoTooltipParagraph">{t('예정된 운동일의 미실행 기록을 포함해요.')}</span></InfoTooltip></h2></div><span>{stats.data.total_count}{t('회')}</span></div>
        <div className="statsChart" role="img" aria-label={`${period_label} · ${chart_fields.map(({ field_name, label }) => t('{0} {1}회', [label, stats.data[field_name]])).join(', ')}`}>
          {chart_fields.map(({ field_name, label, color }) => {
            const bar_height = stats.data[field_name] ? Math.max(8, Math.round(stats.data[field_name] / chart_maximum * 100)) : 0;
            return <div className="statsChartColumn" key={field_name}>
              <div className="statsChartTrack"><span className={`statsChartBar is${color}`} style={{ height: `${bar_height}%` }} /></div>
              <span className="statsChartLabel">{label}</span>
            </div>;
          })}
        </div>
      </section>
      <dl className="statsGrid">{Object.entries(stat_labels).map(([field_name, label]) => <div className="settingsCard" key={field_name}><dt>{label}</dt><dd>{stats.data[field_name]}{t('회')}</dd></div>)}</dl>
    </>}
  </section>;
}
