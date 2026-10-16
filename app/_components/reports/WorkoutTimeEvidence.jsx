import { useLanguage } from '../../_hooks/useLanguage';
import { format_workout_duration, workout_time_method, workout_time_value } from '../../_lib/workoutTime';
import InfoTooltip from '../ui/InfoTooltip';

export default function WorkoutTimeEvidence({ summary, show_days = false, show_info_tooltips = false }) {
  const { t, language } = useLanguage();
  if (!summary) return null;
  const { previous, current } = summary;
  const format_duration = (seconds) => format_workout_duration(seconds, language);
  const number_formatter = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: 2 });
  const time_changes = [
    { key: 'total', label: '측정 운동 시간', previous: previous.measured_seconds, current: current.measured_seconds },
    { key: 'average', label: '측정 운동일 평균', previous: previous.average_seconds, current: current.average_seconds },
  ];
  return <div className="workoutTimeEvidence">
    <p className="workoutTimeComparison">{workout_time_value(summary, language)}{show_info_tooltips && <InfoTooltip label={t('운동 시간')}><span className="infoTooltipParagraph">{t(show_days ? workout_time_method : '운동 시간의 증감은 훈련량 참고 지표입니다. 오래 운동했다는 이유만으로 수행 향상을 판단하지 않습니다.')}</span><span className="infoTooltipParagraph">{t('두 기간 모두 측정 기록이 있어야 운동 시간을 비교할 수 있습니다.')}</span><span className="infoTooltipParagraph">{t('시간과 세트가 함께 기록된 {0}일 기준', [current.timed_set_days])}</span></InfoTooltip>}</p>
    <dl className="workoutTimeMetrics">
      <div><dt>{t('측정 운동일 평균')}</dt><dd>{format_duration(current.average_seconds)}</dd></div>
      <div><dt>{t('측정한 운동일')}</dt><dd>{t('{0}일', [current.measured_days])}</dd></div>
      <div><dt>{t('타이머 측정')}</dt><dd>{format_duration(current.timer_recorded_seconds)}</dd></div>
      <div><dt>{t('직접 보정')}</dt><dd>{format_duration(current.self_reported_seconds)}</dd></div>
      <div><dt>{t('시간당 수행 세트')}</dt><dd>{Number.isFinite(current.sets_per_hour) ? t('{0}세트/시간', [number_formatter.format(current.sets_per_hour)]) : t('비교 자료 부족')}</dd></div>
    </dl>
    {!current.measured_days && <p className="infoText">{t('이번 기간에 확정된 타이머 측정 기록이 없습니다.')}</p>}
    {!show_info_tooltips && !summary.comparable && <p className="infoText">{t('두 기간 모두 측정 기록이 있어야 운동 시간을 비교할 수 있습니다.')}</p>}
    {show_days && <>
      <table className="reportDataTable workoutTimeTable">
        <caption>{t('운동 시간의 변화')}</caption>
        <thead><tr><th scope="col">{t('지표')}</th><th scope="col">{t('이전')}</th><th scope="col">{t('이번')}</th></tr></thead>
        <tbody>{time_changes.map((item) => <tr key={item.key}><th scope="row">{t(item.label)}</th><td>{format_duration(item.previous)}</td><td>{format_duration(item.current)}</td></tr>)}
          <tr><th scope="row">{t('측정한 운동일')}</th><td>{t('{0}일', [previous.measured_days])}</td><td>{t('{0}일', [current.measured_days])}</td></tr>
          <tr><th scope="row">{t('시간당 수행 세트')}</th><td>{Number.isFinite(previous.sets_per_hour) ? t('{0}세트/시간', [number_formatter.format(previous.sets_per_hour)]) : t('비교 자료 부족')}</td><td>{Number.isFinite(current.sets_per_hour) ? t('{0}세트/시간', [number_formatter.format(current.sets_per_hour)]) : t('비교 자료 부족')}</td></tr>
        </tbody>
      </table>
      {current.days.length > 0 && <ul className="reportComparisons">{current.days.map((day) => <li key={day.workout_date}><strong>{day.workout_date} · {format_duration(day.measured_seconds)}</strong><small>{t('타이머 측정 {0} · 직접 보정 {1}', [format_duration(day.timer_recorded_seconds), format_duration(day.self_reported_seconds)])}</small></li>)}</ul>}
    </>}
    {!show_info_tooltips && <>
      <p className="infoText">{t('시간과 세트가 함께 기록된 {0}일 기준', [current.timed_set_days])}</p>
      <p className="infoText">{t(show_days ? workout_time_method : '운동 시간의 증감은 훈련량 참고 지표입니다. 오래 운동했다는 이유만으로 수행 향상을 판단하지 않습니다.')}</p>
    </>}
  </div>;
}
