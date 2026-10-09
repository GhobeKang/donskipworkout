import { useLanguage } from '../../_hooks/useLanguage';
import { comparison_text, personal_report_copy, preference_text, report_status } from '../../_lib/personalReport';

function ComparisonRows({ items }) {
  const { t, language } = useLanguage();
  const direction_labels = { improved: '증가', declined: '감소', mixed: '복합 변화' };
  return <ul className="reportComparisons">{items.map((item) => <li key={item.target_area}>
    <div className="reportComparisonHeading"><strong>{t(item.target_area)}</strong><span className={`reportDirection is${item.direction}`}>{t(direction_labels[item.direction])}</span></div>
    <p>{comparison_text(item, language)}</p>
  </li>)}</ul>;
}

export default function PersonalReport({ report }) {
  const { t, language } = useLanguage();
  const copy = personal_report_copy(report, language);
  const insights = copy.insights;
  const { consistency, recovery, challenges, preferences } = insights;
  const week_labels = { kept: '지킴', missed: '미달' };
  return <article className="personalReport" aria-labelledby="personal-report-heading">
    <header className="reportSummary">
      <p className="cardKicker">{t(report.period_type === 'monthly' ? '월간 변화 리포트' : '주간 변화 리포트')} · {t(report_status(report))}</p>
      <p className="infoText">{report.period_start} — {report.period_end}</p>
      <p className="infoText">{t('기준일: {0}', [report.as_of_date])}</p>
      <h3 id="personal-report-heading">{copy.title}</h3>
      {copy.comparison_period && <p className="infoText">{t('최근 비교 기간: {0}', [copy.comparison_period])}</p>}
      {copy.focus && <div className="reportFocus"><strong>{t('다음에 집중할 점')}</strong><p>{copy.focus}</p></div>}
    </header>
    {copy.metrics.map((metric) => <details className="reportSection" key={metric.key}>
      <summary><span>{metric.label}</span><strong>{metric.value}</strong><small>{t('측정 근거 보기')}</small></summary>
      <div className="reportSectionBody">
        {['recent', 'journey'].includes(metric.key) && <>
          {metric.key === 'journey' && <p className="infoText">{t('첫 기록 기간: {0} — {1}', [insights.journey.baseline_start, insights.journey.baseline_end])}</p>}
          <ComparisonRows items={insights[metric.key].comparisons} />
        </>}
        {metric.key === 'recovery' && <ul className="reportComparisons">{[...recovery.events].reverse().map((event) => <li key={event.return_week}>
          <strong>{event.missed_week} → {event.return_week}</strong><p>{t('복귀 달성')}</p><small>{t('첫 복귀일: {0}', [event.first_return_date])}</small>
        </li>)}</ul>}
        {metric.key === 'challenges' && <>
          {challenges.new_areas.length > 0 && <><h4>{t('첫 도전')}</h4><ul className="reportComparisons">{challenges.new_areas.map((area) => <li key={area.target_area}><strong>{t(area.target_area)}</strong><small>{area.first_date}</small></li>)}</ul></>}
          {challenges.personal_record_areas.length > 0 && <><h4>{t('개인 기록 경신')}</h4><ul className="reportComparisons">{challenges.personal_record_areas.map((area) => <li key={area.target_area}><strong>{t(area.target_area)}</strong><p>{t('개인 기록을 경신한 종목 {0}개', [area.record_count])}</p></li>)}</ul></>}
        </>}
        {metric.key === 'consistency' && <ul className="reportComparisons">{[...consistency.weeks].reverse().map((week) => <li key={week.week_start}>
          <strong>{week.previous.week_start} → {week.week_start}</strong>
          <p>{t('완료 {0}/{1}회 → {2}/{3}회', [week.previous.completed_count, week.previous.target_count, week.completed_count, week.target_count])}</p>
          {week.previous.status !== week.status && <small>{t(week_labels[week.previous.status])} → {t(week_labels[week.status])}</small>}
        </li>)}</ul>}
        {metric.key === 'preferences' && <>
          <p className="infoText">{t('세트를 기록한 운동일 중 해당 부위를 운동한 날의 비중이에요.')}</p>
          <ul className="reportComparisons">{preferences.map((item) => <li key={item.target_area}>
            <strong>{t(item.target_area)}</strong><p>{preference_text(item, language)}</p>
          </li>)}</ul>
        </>}
      </div>
    </details>)}
    {copy.metrics.length > 0 && <details className="shareRules"><summary>{t('측정 기준과 한계')}</summary>{copy.method_messages.map((message) => <p key={message}>{t(message)}</p>)}
      <p>{t('기록이 추가되거나 수정되면 리포트도 다시 계산돼요.')}</p>
    </details>}
  </article>;
}
