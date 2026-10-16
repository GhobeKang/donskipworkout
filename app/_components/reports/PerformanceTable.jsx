import { useLanguage } from '../../_hooks/useLanguage';

export const performance_direction_labels = { improved: '수행 향상', maintained: '수행 유지', declined: '기록 확인 필요' };

export default function PerformanceTable({ comparisons, detailed = false }) {
  const { t, language } = useLanguage();
  const number_formatter = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: 2 });
  const record_value = (comparison, value) => t(comparison.dimension === 'reps' ? '{0}회' : '{0}kg', [number_formatter.format(value)]);
  return <table className={`reportDataTable${detailed ? ' isDetailed' : ''}`}>
    <caption className="srOnly">{t('동일 조건의 수행 변화')}</caption>
    <thead><tr><th scope="col">{t('종목·조건')}</th>{detailed ? <><th scope="col">{t('이전')}</th><th scope="col">{t('이번')}</th></> : <th scope="col">{t('이전 → 이번')}</th>}<th scope="col">{t('변화·확인')}</th></tr></thead>
    <tbody>{comparisons.map((comparison) => {
      const record_delta = comparison.current_value - comparison.previous_value;
      return <tr key={JSON.stringify([comparison.exercise_source, comparison.exercise_id, comparison.dimension, comparison.condition_value])}>
        <th scope="row">{comparison.exercise_name}<small>{t(comparison.dimension === 'reps' ? '동일 {0}kg 중량' : '동일 {0}회 반복', [number_formatter.format(comparison.condition_value)])}</small></th>
        {detailed ? <>
          <td><strong>{record_value(comparison, comparison.previous_value)}</strong><small>{comparison.previous_date}</small><small>{t('기록 {0}일', [comparison.previous_observation_days])}</small></td>
          <td><strong>{record_value(comparison, comparison.current_value)}</strong><small>{comparison.current_date}</small><small>{t('기록 {0}일', [comparison.current_observation_days])}</small></td>
        </> : <td>{record_value(comparison, comparison.previous_value)}<span className="reportTableArrow" aria-hidden="true"> → </span>{record_value(comparison, comparison.current_value)}</td>}
        <td><span className={`reportDirection is${comparison.direction === 'declined' ? 'review' : comparison.direction}`}>{t(performance_direction_labels[comparison.direction])}</span>
          {record_delta !== 0 && <strong>{record_delta > 0 ? '+' : '−'}{record_value(comparison, Math.abs(record_delta))}</strong>}
          <small>{comparison.confirmation_days >= 2 ? t('확인 {0}일', [comparison.confirmation_days]) : t('관찰 1일')}</small>
        </td>
      </tr>;
    })}</tbody>
  </table>;
}
