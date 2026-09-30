import { useLanguage } from '../../_hooks/useLanguage';
import { exercise_label, format_workout_date } from '../../_lib/i18n';
import { comparison_text, personal_report_copy, report_method_messages } from '../../_lib/personalReport';

function ComparisonRows({ items }) {
  const { t, language } = useLanguage();
  const direction_labels = { improved: '향상', maintained: '유지', declined: '감소' };
  if (!items.length) return <p className="infoText">{t('같은 조건의 비교 기록이 없어요.')}</p>;
  return <ul className="reportComparisons">{items.map((item) => <li key={`${item.exercise_source}:${item.exercise_id}:${item.dimension}:${item.condition_value}`}>
    <div className="reportComparisonHeading"><strong>{exercise_label(item, language)}</strong><span className={`reportDirection is${item.direction}`}>{t(direction_labels[item.direction])}</span></div>
    <p>{comparison_text(item, language)}</p>
    <small>{format_workout_date(item.previous_date, language, { year: 'numeric', month: 'short', day: 'numeric' })} → {format_workout_date(item.current_date, language, { year: 'numeric', month: 'short', day: 'numeric' })}</small>
  </li>)}</ul>;
}

export default function PersonalReport({ report }) {
  const { t, language } = useLanguage();
  const insights = report.insights;
  const copy = personal_report_copy(report, language);
  const { consistency, recovery, challenges, preferences } = insights;
  const week_labels = { kept: '지킴', missed: '미달', rest: '목표 없는 주', unknown: '목표 이력 없음', in_progress: '진행 중' };
  const event_labels = { recovered: '복귀 달성', pending: '진행 중', not_recovered: '다음 약속도 미달' };
  return <article className="personalReport" aria-labelledby="personal-report-heading">
    <header className="reportSummary">
      <p className="cardKicker">{t('나의 변화 리포트')} · {t(report.is_current_week ? '진행 중' : '주간 결산')}</p>
      <p className="infoText">{report.week_start} — {report.week_end}</p>
      <h3 id="personal-report-heading">{copy.title}</h3>
      <p className="reportCoverage">{copy.coverage}</p>
      <p className="infoText">{copy.commitment}</p>
      <p className="infoText">{t('최근 비교 기간: {0}', [copy.comparison_period])}</p>
      {copy.evidence.length > 0 && <ul className="reportEvidence">{copy.evidence.map((message) => <li key={message}>{message}</li>)}</ul>}
      <div className="reportFocus"><strong>{t('다음에 집중할 점')}</strong><p>{copy.focus}</p></div>
    </header>
    {copy.metrics.map((metric) => <details className="reportSection" key={metric.key}>
      <summary><span>{metric.label}</span><strong>{metric.value}</strong><small>{t('측정 근거 보기')}</small></summary>
      <div className="reportSectionBody">
        {['recent', 'journey'].includes(metric.key) && <>
          <p className="infoText">{t('비교 가능 {0} / {1}종목 · 조건별 유지 {2}종목', [insights[metric.key].comparable_count, insights[metric.key].exercise_count, insights[metric.key].maintained_count])}</p>
          <p className="infoText">{t('한 종목에 향상·유지·감소가 함께 집계될 수 있어요.')}</p>
          <ComparisonRows items={insights[metric.key].comparisons} />
        </>}
        {metric.key === 'recovery' && <>
          <p className="infoText">{t('목표를 놓친 뒤 다음 약속 주의 목표를 채운 경우입니다. 기회가 없으면 감점하지 않아요.')}</p>
          <p>{t('평가 대기 {0}건', [recovery.pending_count])}{recovery.recovery_percent !== null && ` · ${recovery.recovery_percent}%`}</p>
          <ul className="reportComparisons">{[...recovery.events].reverse().map((event) => <li key={event.return_week}>
            <strong>{event.missed_week} → {event.return_week}</strong><p>{t(event_labels[event.status])}</p><small>{t('첫 복귀일: {0}', [event.first_return_date || '—'])}</small>
          </li>)}</ul>
        </>}
        {metric.key === 'challenges' && <>
          <h4>{t('첫 도전')}</h4>
          {challenges.new_exercises.length ? <ul className="reportComparisons">{challenges.new_exercises.map((exercise) => <li key={`${exercise.exercise_source}:${exercise.exercise_id}`}><strong>{exercise_label(exercise, language)}</strong><small>{exercise.first_date}</small></li>)}</ul> : <p className="infoText">{t('이번 기간에 처음 기록한 종목이 없어요.')}</p>}
          <h4>{t('개인 기록 경신')}</h4><ComparisonRows items={challenges.personal_records} />
        </>}
        {metric.key === 'consistency' && <>
          <p>{t('최장 연속 {0}주 · 평가한 약속 {1}주', [consistency.longest_streak, consistency.evaluated_weeks])}</p>
          <p className="infoText">{t('진행 중인 주는 연속 기록에 아직 합산하지 않아요.')}</p>
          <ul className="reportWeekList">{[...consistency.weeks].reverse().map((week) => <li key={week.week_start}><time>{week.week_start}</time><span>{week.completed_count} / {week.target_count ?? '—'}</span><strong>{t(week_labels[week.status])}</strong></li>)}</ul>
        </>}
        {metric.key === 'preferences' && <>
          <p className="infoText">{t('세트를 기록한 운동일 중 해당 종목을 한 날의 비중이에요. 우열을 평가하지 않아요.')}</p>
          <ul className="reportComparisons">{preferences.map((item) => <li key={`${item.exercise_source}:${item.exercise_id}`}>
            <strong>{exercise_label(item, language)}</strong><p>{t('운동한 날 {0} → {1}회', [item.previous_session_count, item.session_count])}</p>
            <small>{t('기록한 운동 중 비중')} {item.previous_session_percent === null ? '—' : `${item.previous_session_percent}%`} → {item.session_percent === null ? '—' : `${item.session_percent}%`}</small>
            {item.session_percent !== null && <progress value={item.session_percent} max={100} aria-label={t('{0} 운동일 비중', [exercise_label(item, language)])} />}
          </li>)}</ul>
        </>}
      </div>
    </details>)}
    <details className="shareRules"><summary>{t('측정 기준과 한계')}</summary>{report_method_messages.map((message) => <p key={message}>{t(message)}</p>)}
      <p>{t('비교에서 제외된 삭제 종목 세트: {0}', [insights.coverage.excluded_set_count])}</p>
      <p>{t('기록이 추가되거나 수정되면 리포트도 다시 계산돼요.')}</p>
    </details>
  </article>;
}
