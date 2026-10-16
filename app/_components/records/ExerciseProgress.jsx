import InfoTooltip from '../ui/InfoTooltip';
import { useState } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import useApiResource from '../../_hooks/useApiResource';
import { exercise_label, format_workout_date } from '../../_lib/i18n';
import { report_area_label } from '../../_lib/exerciseClassification';
import RequestState from '../ui/RequestState';

const metric_options = [
  { key: 'max_weight', label: '최고 중량', unit: 'kg' },
  { key: 'volume', label: '총 운동량', unit: 'kg·회' },
  { key: 'max_reps', label: '최대 반복 수', unit: '회' },
];
const unset_area_key = '__unset__';
const date_value = (workout_date) => Date.parse(`${workout_date}T00:00:00Z`);

function aggregate_area_points(exercises) {
  const points_by_date = new Map();
  exercises.forEach((exercise) => exercise.points.forEach((point) => {
    const date_point = points_by_date.get(point.workout_date) || {
      workout_date: point.workout_date,
      volume: 0,
      set_count: 0,
      exercise_keys: new Set(),
    };
    date_point.volume += point.volume;
    date_point.set_count += point.set_count;
    date_point.exercise_keys.add(exercise.exercise_key);
    points_by_date.set(point.workout_date, date_point);
  }));
  return [...points_by_date.values()]
    .map((point) => ({ ...point, exercise_count: point.exercise_keys.size }))
    .sort((first, second) => date_value(first.workout_date) - date_value(second.workout_date));
}

export default function ExerciseProgress({ revision, on_unauthorized, timezone = 'Asia/Seoul' }) {
  const { t, language } = useLanguage();
  const [reload_count, set_reload_count] = useState(0);
  const [chart_scope, set_chart_scope] = useState('area');
  const [selected_area_key, set_selected_area_key] = useState('');
  const [exercise_key, set_exercise_key] = useState('');
  const [metric_key, set_metric_key] = useState('max_weight');
  const [period_days, set_period_days] = useState(0);
  const progress = useApiResource('/exercise-progress', `${revision}:${reload_count}`, on_unauthorized);
  const exercises = progress.data || [];
  const areas = [...new Set(exercises.map((exercise) => exercise.target_area || unset_area_key))]
    .sort((first, second) => first.localeCompare(second));
  const selected_area_key_valid = areas.includes(selected_area_key);
  const active_area_key = selected_area_key_valid ? selected_area_key : areas[0];
  const area_exercises = exercises.filter((exercise) => (
    (exercise.target_area || unset_area_key) === active_area_key
  ));
  const selected_exercise = exercises.find((exercise) => exercise.exercise_key === exercise_key)
    || exercises[0];
  const area_points = aggregate_area_points(area_exercises);
  const selected_metric_key = chart_scope === 'area' ? 'volume' : metric_key;
  const selected_metric = metric_options.find((metric) => metric.key === selected_metric_key);
  const selected_chart_points = chart_scope === 'area' ? area_points : selected_exercise?.points || [];
  const selected_label = chart_scope === 'area'
    ? report_area_label(active_area_key === unset_area_key ? null : active_area_key, language)
    : exercise_label(selected_exercise, language);
  const today_date = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const cutoff_date = date_value(today_date) - (period_days - 1) * 86400000;
  const points = selected_chart_points.filter((point) => (
    !period_days || date_value(point.workout_date) >= cutoff_date
  ));
  const format_value = (value) => new Intl.NumberFormat(
    language === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: 2 },
  ).format(value);
  const metric_unit = t(selected_metric.unit);
  const first_point = points[0];
  const latest_point = points.at(-1);
  const chart_max = Math.max(1, ...points.map((point) => point[selected_metric_key])) * 1.1;
  const start_date = first_point ? date_value(first_point.workout_date) : 0;
  const date_span = latest_point ? date_value(latest_point.workout_date) - start_date : 0;
  const chart_points = points.map((point) => ({ ...point,
    x: date_span ? 62 + (date_value(point.workout_date) - start_date) / date_span * 278 : 201,
    y: 180 - point[selected_metric_key] / chart_max * 150,
  }));
  const change_value = latest_point
    ? latest_point[selected_metric_key] - first_point[selected_metric_key]
    : 0;

  return <section className="exerciseProgress" aria-labelledby="exercise-progress-title">
    <div className="sectionHeading"><h2 id="exercise-progress-title">{t('종목별 성장 추이')}<InfoTooltip label={t('종목별 성장 추이')}>{t('출석 여부와 관계없이 저장한 세트를 날짜별로 비교합니다.')}</InfoTooltip></h2></div>
    <RequestState loading={progress.loading} error={progress.error} on_retry={reload_count < 2 ? () => set_reload_count((count) => count + 1) : undefined} />
    {progress.error && reload_count >= 2 && <p className="infoText">{t('다시 시도하려면 성장 추이 탭을 다시 열어 주세요.')}</p>}
    {!progress.loading && !progress.error && !exercises.length && <p className="emptyState">{t('아직 기록한 세트가 없습니다. 세트 기록을 저장하면 그래프가 나타납니다.')}</p>}
    {!!exercises.length && <>
      <div className="tabs progressMetrics" aria-label={t('성장 추이 보기 방식')}>
        <button type="button" aria-pressed={chart_scope === 'area'} className={chart_scope === 'area' ? 'isActive' : ''} onClick={() => set_chart_scope('area')}>{t('부위별')}</button>
        <button type="button" aria-pressed={chart_scope === 'exercise'} className={chart_scope === 'exercise' ? 'isActive' : ''} onClick={() => set_chart_scope('exercise')}>{t('종목별')}</button>
      </div>
      {chart_scope === 'area' && <>
        <label className="fieldLabel" htmlFor="progress-area">{t('타겟 부위')}</label>
        <select id="progress-area" className="progressSelect" value={active_area_key} onChange={(event) => set_selected_area_key(event.target.value)}>
          {areas.map((area_key) => <option key={area_key} value={area_key}>{report_area_label(area_key === unset_area_key ? null : area_key, language)}</option>)}
        </select>
      </>}
      {chart_scope === 'exercise' && <>
        <label className="fieldLabel" htmlFor="progress-exercise">{t('운동 종목')}</label>
        <select id="progress-exercise" className="progressSelect" value={selected_exercise.exercise_key} onChange={(event) => set_exercise_key(event.target.value)}>
          {exercises.map((exercise) => <option key={exercise.exercise_key} value={exercise.exercise_key}>{exercise_label(exercise, language)} · {report_area_label(exercise.target_area, language)}</option>)}
        </select>
        <div className="tabs progressMetrics" aria-label={t('비교 지표')}>
          {metric_options.map((metric) => <button type="button" key={metric.key} aria-pressed={metric_key === metric.key} className={metric_key === metric.key ? 'isActive' : ''} onClick={() => set_metric_key(metric.key)}>{t(metric.label)}</button>)}
        </div>
      </>}
      <label className="fieldLabel" htmlFor="progress-period">{t('조회 기간')}</label>
      <select id="progress-period" className="progressSelect" value={period_days} onChange={(event) => set_period_days(Number(event.target.value))}>
        <option value={0}>{t('전체 기간')}</option><option value={30}>{t('최근 30일')}</option><option value={90}>{t('최근 90일')}</option>
      </select>
      {points.length ? <div className="statsChartCard progressChartCard">
        <div className="statsChartHeading"><div><p className="cardKicker">{t('최근 기록')}</p><h3>{format_value(latest_point[selected_metric_key])} <small>{metric_unit}</small><InfoTooltip label={t(selected_metric.label)}>{chart_scope === 'area'
        ? t('부위별 운동량은 해당 부위 종목들의 세트별 중량 × 반복 수를 날짜별로 합산한 값입니다. 종목 구성에 따라 값이 달라질 수 있으며, 종목 간 중량 기록을 직접 비교하지 않습니다.')
        : t(selected_metric_key === 'volume' ? '총 운동량 = 각 세트의 중량 × 반복 수의 합. 맨몸 운동은 반복 수로 비교하세요.' : selected_metric_key === 'max_reps' ? '해당 날짜에 한 세트에서 수행한 가장 많은 반복 수입니다.' : '해당 날짜에 기록한 가장 무거운 중량입니다. 반복 수와 운동 자세도 함께 고려하세요.')}</InfoTooltip></h3></div><span>{points.length >= 2 ? `${t('기간 내 변화')} ${change_value > 0 ? '+' : ''}${format_value(change_value)} ${metric_unit}` : t('첫 기록')}</span></div>
        <svg className="progressChart" viewBox="0 0 364 218" role="img" aria-label={`${selected_label} · ${t(selected_metric.label)} · ${t('날짜별 수치는 아래 표에서 확인하세요.')}`}>
          {[0, 0.5, 1].map((ratio) => <g key={ratio}><line x1="62" x2="340" y1={180 - ratio * 150} y2={180 - ratio * 150} className="progressGrid" /><text x="54" y={184 - ratio * 150} textAnchor="end">{format_value(chart_max * ratio)}</text></g>)}
          <polyline points={chart_points.map((point) => `${point.x},${point.y}`).join(' ')} className="progressLine" />
          {chart_points.map((point) => <circle key={point.workout_date} cx={point.x} cy={point.y} r="4" className="progressDot"><title>{`${point.workout_date}: ${format_value(point[selected_metric_key])} ${metric_unit}`}</title></circle>)}
          <text x="62" y="207">{format_workout_date(first_point.workout_date, language)}</text>
          {points.length > 1 && <text x="340" y="207" textAnchor="end">{format_workout_date(latest_point.workout_date, language)}</text>}
        </svg>
        <p className="infoText">{points.length === 1 ? <InfoTooltip label={t('첫 기록')}>{t('다른 날짜의 기록이 쌓이면 변화 추이를 볼 수 있습니다.')}</InfoTooltip> : `${first_point.workout_date} – ${latest_point.workout_date}`}</p>
        <details className="progressDetails"><summary>{t('날짜별 수치 보기')}</summary><div className="progressTableWrap"><table className="progressTable"><caption>{selected_label} · {t(selected_metric.label)} ({metric_unit})</caption><thead><tr><th scope="col">{t('기록 날짜')}</th><th scope="col">{t(selected_metric.label)}</th>{chart_scope === 'area' && <><th scope="col">{t('종목 수')}</th><th scope="col">{t('총 세트')}</th></>}</tr></thead><tbody>{[...points].reverse().map((point) => <tr key={point.workout_date}><td>{point.workout_date}</td><td>{format_value(point[selected_metric_key])} {metric_unit}</td>{chart_scope === 'area' && <><td>{point.exercise_count}</td><td>{point.set_count}</td></>}</tr>)}</tbody></table></div></details>
      </div> : <p className="emptyState">{t('선택한 기간에 저장된 세트가 없습니다.')}</p>}
    </>}
  </section>;
}
