import { useState } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import useApiResource from '../../_hooks/useApiResource';
import { exercise_label, format_workout_date } from '../../_lib/i18n';
import RequestState from '../ui/RequestState';

const metric_options = [
  { key: 'max_weight', label: '최고 중량', unit: 'kg' },
  { key: 'volume', label: '총 운동량', unit: 'kg·회' },
  { key: 'max_reps', label: '최대 반복 수', unit: '회' },
];
const date_value = (workout_date) => Date.parse(`${workout_date}T00:00:00Z`);

export default function ExerciseProgress({ revision, on_unauthorized }) {
  const { t, language } = useLanguage();
  const [reload_count, set_reload_count] = useState(0);
  const [exercise_key, set_exercise_key] = useState('');
  const [metric_key, set_metric_key] = useState('max_weight');
  const [period_days, set_period_days] = useState(0);
  const progress = useApiResource('/exercise-progress', `${revision}:${reload_count}`, on_unauthorized);
  const selected_exercise = progress.data?.find((exercise) => exercise.exercise_key === exercise_key) || progress.data?.[0];
  const selected_metric = metric_options.find((metric) => metric.key === metric_key);
  const today_date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const cutoff_date = date_value(today_date) - (period_days - 1) * 86400000;
  const points = (selected_exercise?.points || []).filter((point) => !period_days || date_value(point.workout_date) >= cutoff_date);
  const format_value = (value) => new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: 2 }).format(value);
  const metric_unit = t(selected_metric.unit);
  const first_point = points[0];
  const latest_point = points.at(-1);
  const chart_max = Math.max(1, ...points.map((point) => point[metric_key])) * 1.1;
  const start_date = first_point ? date_value(first_point.workout_date) : 0;
  const date_span = latest_point ? date_value(latest_point.workout_date) - start_date : 0;
  const chart_points = points.map((point) => ({ ...point,
    x: date_span ? 62 + (date_value(point.workout_date) - start_date) / date_span * 278 : 201,
    y: 180 - point[metric_key] / chart_max * 150,
  }));
  const change_value = latest_point ? latest_point[metric_key] - first_point[metric_key] : 0;

  return <section className="exerciseProgress" aria-labelledby="exercise-progress-title">
    <div className="sectionHeading"><h2 id="exercise-progress-title">{t('종목별 성장 추이')}</h2></div>
    <p className="infoText">{t('출석 여부와 관계없이 저장한 세트를 날짜별로 비교합니다.')}</p>
    <RequestState loading={progress.loading} error={progress.error} on_retry={reload_count < 2 ? () => set_reload_count((count) => count + 1) : undefined} />
    {progress.error && reload_count >= 2 && <p className="infoText">{t('다시 시도하려면 성장 추이 탭을 다시 열어 주세요.')}</p>}
    {!progress.loading && !progress.error && !selected_exercise && <p className="emptyState">{t('아직 기록한 세트가 없습니다. 세트 기록을 저장하면 그래프가 나타납니다.')}</p>}
    {selected_exercise && <>
      <label className="fieldLabel" htmlFor="progress-exercise">{t('운동 종목')}</label>
      <select id="progress-exercise" className="progressSelect" value={selected_exercise.exercise_key} onChange={(event) => set_exercise_key(event.target.value)}>
        {progress.data.map((exercise) => <option key={exercise.exercise_key} value={exercise.exercise_key}>{exercise_label(exercise, language)} · {t(exercise.archived ? '삭제한 종목' : exercise.exercise_source === 'shared' ? '기본' : '내 종목')}</option>)}
      </select>
      <div className="tabs progressMetrics" aria-label={t('비교 지표')}>{metric_options.map((metric) => <button type="button" key={metric.key} aria-pressed={metric_key === metric.key} className={metric_key === metric.key ? 'isActive' : ''} onClick={() => set_metric_key(metric.key)}>{t(metric.label)}</button>)}</div>
      <label className="fieldLabel" htmlFor="progress-period">{t('조회 기간')}</label>
      <select id="progress-period" className="progressSelect" value={period_days} onChange={(event) => set_period_days(Number(event.target.value))}>
        <option value={0}>{t('전체 기간')}</option><option value={30}>{t('최근 30일')}</option><option value={90}>{t('최근 90일')}</option>
      </select>
      <p className="infoText">{t(metric_key === 'volume' ? '총 운동량 = 각 세트의 중량 × 반복 수의 합. 맨몸 운동은 반복 수로 비교하세요.' : metric_key === 'max_reps' ? '해당 날짜에 한 세트에서 수행한 가장 많은 반복 수입니다.' : '해당 날짜에 기록한 가장 무거운 중량입니다. 반복 수와 운동 자세도 함께 고려하세요.')}</p>
      {points.length ? <div className="statsChartCard progressChartCard">
        <div className="statsChartHeading"><div><p className="cardKicker">{t('최근 기록')}</p><h3>{format_value(latest_point[metric_key])} <small>{metric_unit}</small></h3></div><span>{points.length >= 2 ? `${t('기간 내 변화')} ${change_value > 0 ? '+' : ''}${format_value(change_value)} ${metric_unit}` : t('첫 기록')}</span></div>
        <svg className="progressChart" viewBox="0 0 364 218" role="img" aria-label={`${exercise_label(selected_exercise, language)} · ${t(selected_metric.label)} · ${t('날짜별 수치는 아래 표에서 확인하세요.')}`}>
          {[0, 0.5, 1].map((ratio) => <g key={ratio}><line x1="62" x2="340" y1={180 - ratio * 150} y2={180 - ratio * 150} className="progressGrid" /><text x="54" y={184 - ratio * 150} textAnchor="end">{format_value(chart_max * ratio)}</text></g>)}
          <polyline points={chart_points.map((point) => `${point.x},${point.y}`).join(' ')} className="progressLine" />
          {chart_points.map((point) => <circle key={point.workout_date} cx={point.x} cy={point.y} r="4" className="progressDot"><title>{`${point.workout_date}: ${format_value(point[metric_key])} ${metric_unit}`}</title></circle>)}
          <text x="62" y="207">{format_workout_date(first_point.workout_date, language)}</text>
          {points.length > 1 && <text x="340" y="207" textAnchor="end">{format_workout_date(latest_point.workout_date, language)}</text>}
        </svg>
        <p className="infoText">{points.length === 1 ? t('다른 날짜의 기록이 쌓이면 변화 추이를 볼 수 있습니다.') : `${first_point.workout_date} – ${latest_point.workout_date}`}</p>
        <details className="progressDetails"><summary>{t('날짜별 수치 보기')}</summary><div className="progressTableWrap"><table className="progressTable"><caption>{exercise_label(selected_exercise, language)} · {t(selected_metric.label)} ({metric_unit})</caption><thead><tr><th scope="col">{t('기록 날짜')}</th><th scope="col">{t(selected_metric.label)}</th></tr></thead><tbody>{[...points].reverse().map((point) => <tr key={point.workout_date}><td>{point.workout_date}</td><td>{format_value(point[metric_key])} {metric_unit}</td></tr>)}</tbody></table></div></details>
      </div> : <p className="emptyState">{t('선택한 기간에 저장된 세트가 없습니다.')}</p>}
    </>}
  </section>;
}
