import { useLanguage } from '../../_hooks/useLanguage';
import { performance_text } from '../../_lib/reportEvidence';
import PerformanceTable, { performance_direction_labels } from './PerformanceTable';
import WorkoutTimeEvidence from './WorkoutTimeEvidence';

export default function PersonalGrowthOverview({ report, copy }) {
  const { t, language } = useLanguage();
  const { performance, consistency, recovery } = copy.insights;
  const highlight = copy.highlight;
  const number_formatter = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: 2 });
  const record_value = (value) => t(highlight.dimension === 'reps' ? '{0}회' : '{0}kg', [number_formatter.format(value)]);
  const bar_maximum = highlight ? Math.max(highlight.previous_value, highlight.current_value) : 0;
  const record_delta = highlight ? highlight.current_value - highlight.previous_value : 0;
  const review_count = (performance?.review_count || 0) + (performance?.mixed_count || 0);
  const comparison_rows = [...(performance?.comparisons || [])].sort((first, second) => {
    const direction_priority = { declined: 0, improved: 1, maintained: 2 };
    return direction_priority[first.direction] - direction_priority[second.direction];
  });
  const selected_weeks = (report.insights.consistency.period_weeks?.length ? report.insights.consistency.period_weeks : report.insights.consistency.weeks || []).filter((week) => {
    const week_end = new Date(`${week.week_start}T00:00:00Z`);
    week_end.setUTCDate(week_end.getUTCDate() + 6);
    return week_end.toISOString().slice(0, 10) >= report.period_start
      && (week_end.toISOString().slice(0, 10) <= report.as_of_date || week.status === 'in_progress')
      && week.week_start <= report.as_of_date && week.status !== 'unknown';
  });
  const week_labels = { kept: '달성', missed: '미달', in_progress: report.is_current_period ? '진행 중' : '부분 주', rest: '휴식' };
  const latest_return = recovery.events.at(-1);
  return <>
    {highlight && <figure className="personalPerformanceGraphic">
      <figcaption><span>{highlight.exercise_name}</span><small>{t(highlight.dimension === 'reps' ? '동일 {0}kg 중량' : '동일 {0}회 반복', [number_formatter.format(highlight.condition_value)])}</small></figcaption>
      <div className="personalPerformanceDelta"><strong>{record_delta === 0 ? record_value(highlight.current_value) : `${record_delta > 0 ? '+' : '−'}${record_value(Math.abs(record_delta))}`}</strong><span>{t(performance_direction_labels[highlight.direction])}</span></div>
      <div className="personalPerformanceBars" role="img" aria-label={`${highlight.exercise_name} · ${performance_text(highlight, language)}`}>
        {[[t('이전'), highlight.previous_value, ''], [t('이번'), highlight.current_value, ' isCurrent']].map(([label, value, state_class]) => <div className="personalPerformanceBar" key={label} aria-hidden="true">
          <span>{label}</span><div className="personalPerformanceTrack"><div className={`personalPerformanceFill${state_class}`} style={{ width: `${bar_maximum > 0 ? value / bar_maximum * 100 : 0}%` }} /></div><strong>{record_value(value)}</strong>
        </div>)}
      </div>
      <p className="personalPerformanceConfirmation">{t(highlight.confirmation_days >= 2 ? '서로 다른 운동일 {0}일에서 확인' : '한 운동일에서 관찰 · 반복 확인 전', [highlight.confirmation_days])}</p>
    </figure>}
    {review_count > 0 && <p className="personalReportNotice">{t('확인이 필요한 기록 {0}종목', [review_count])}</p>}
    {copy.insights.workout_time && <section className="personalTimeGraphic" aria-label={t('운동 시간의 변화')}>
      <div className="personalGoalHeading"><h4>{t('운동 시간의 변화')}</h4></div>
      <WorkoutTimeEvidence summary={copy.insights.workout_time} show_info_tooltips />
    </section>}
    <section className="personalGoalGraphic" aria-label={t('지켜온 운동 목표')}>
      <div className="personalGoalHeading"><span>{t('지켜온 운동 목표')}</span><strong>{consistency.period_evaluated_weeks > 0 ? t('{0}/{1}주 달성', [consistency.period_kept_weeks, consistency.period_evaluated_weeks]) : t(selected_weeks.some((week) => week.status === 'in_progress') ? report.is_current_period ? '진행 중 · 평가 전' : '부분 주 · 평가 제외' : selected_weeks.some((week) => week.status === 'rest') ? '휴식 목표 주' : '개인 목표 평가 자료 부족')}</strong></div>
      {selected_weeks.length > 0 && <ul className="personalGoalWeeks">{selected_weeks.map((week) => <li className={`is${week.status}`} key={week.week_start}>
        <time dateTime={week.week_start}>{week.week_start.slice(5)}</time><strong>{t(week_labels[week.status])}</strong><small>{t('{0}/{1}회', [week.completed_count, week.target_count])}</small>
      </li>)}</ul>}
      {consistency.current_streak >= 2 && <p className="infoText">{t('비교 이력에서 목표 {0}주 연속 달성', [consistency.current_streak])}</p>}
    </section>
    {latest_return && <section className="personalReturnGraphic" aria-label={t('다시 돌아오는 힘')}>
      <div className="personalGoalHeading"><span>{t('다시 돌아오는 힘')}</span><strong>{t(latest_return.status === 'recovered' ? '복귀 달성' : '복귀 진행 중')}</strong></div>
      <ol><li><span>{t('목표 미달')}</span><small>{latest_return.missed_week}</small></li><li><span>{t('운동 재개')}</span><small>{latest_return.first_return_date}</small></li><li className={latest_return.status === 'recovered' ? 'isRecovered' : ''}><span>{t(latest_return.status === 'recovered' ? '목표 달성' : '목표 확인 중')}</span><small>{latest_return.return_week}</small></li></ol>
      {recovery.events.length > 1 && <small className="infoText">{t('복귀 달성 {0}번 · 운동 재개 확인 중 {1}번', [recovery.recovered_count, recovery.pending_count])}</small>}
    </section>}
    {performance && <section className="personalPerformanceTable" aria-label={t('종목별 수행 요약')}>
      <div className="personalGoalHeading"><h4>{t('종목별 수행 요약')}</h4><small>{t('비교 {0}/{1}종목', [performance.comparable_count, performance.exercise_count])}</small></div>
      {comparison_rows.length > 0 ? <PerformanceTable comparisons={comparison_rows.slice(0, 4)} /> : <p className="infoText">{t('동일 조건 수행 비교 자료 부족')}</p>}
      {comparison_rows.length > 4 && <p className="infoText">{t('나머지 {0}개 비교는 상세 기록에서 확인', [comparison_rows.length - 4])}</p>}
      {performance.uncomparable_count > 0 && <p className="infoText">{t('비교 자료 부족 {0}종목', [performance.uncomparable_count])}</p>}
    </section>}
  </>;
}
