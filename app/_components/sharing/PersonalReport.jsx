import InfoTooltip from '../ui/InfoTooltip';
import { useLanguage } from '../../_hooks/useLanguage';
import { report_area_label } from '../../_lib/exerciseClassification';
import { comparison_text, personal_report_copy, preference_text, report_status } from '../../_lib/personalReport';
import PerformanceEvidence from '../reports/PerformanceEvidence';
import PersonalGrowthOverview from '../reports/PersonalGrowthOverview';
import WorkoutTimeEvidence from '../reports/WorkoutTimeEvidence';
import MuscleActivityReport from '../reports/MuscleActivityReport';
import PersonalRecords from '../reports/PersonalRecords';

function ComparisonRows({ items }) {
  const { t, language } = useLanguage();
  const direction_labels = { improved: '증가', declined: '감소', mixed: '복합 변화' };
  return <ul className="reportComparisons">{items.map((item) => <li key={item.target_area}>
    <div className="reportComparisonHeading"><strong>{report_area_label(item.target_area, language)}</strong><span className="reportDirection">{t(direction_labels[item.direction])}</span></div>
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
      <h3 id="personal-report-heading">{copy.title}</h3>
      <PersonalGrowthOverview report={report} copy={copy} />
    </header>
    {insights.muscle_activity && <MuscleActivityReport activity={insights.muscle_activity} />}
    <PersonalRecords records={insights.personal_records} />
    <details className="personalReportDetails">
      <summary>{t('상세 기록과 측정 근거')}</summary>
      <div className="personalReportDetailBody">
        <p className="infoText">{t('기준일: {0}', [report.as_of_date])}</p>
        {copy.comparison_period && <p className="infoText">{t('최근 비교 기간: {0}', [copy.comparison_period])}</p>}
        {copy.focus && <div className="reportFocus"><strong>{t('다음에 집중할 점')}</strong><p>{copy.focus}</p></div>}
    {copy.metrics.map((metric) => <details className="reportSection" key={metric.key}>
      <summary><span>{metric.label}</span><strong>{metric.value}</strong><small>{t('측정 근거 보기')}</small></summary>
      <div className="reportSectionBody">
        {metric.key === 'workout_time' && <WorkoutTimeEvidence summary={insights.workout_time} show_days show_info_tooltips />}
        {['performance', 'journey_performance'].includes(metric.key) && <>
          {metric.key === 'journey_performance' && <p className="infoText">{t('첫 기록 기간: {0} — {1}', [insights.journey.baseline_start, insights.journey.baseline_end])}</p>}
          <PerformanceEvidence performance={insights[metric.key]} show_info_tooltips />
        </>}
        {['recent', 'journey'].includes(metric.key) && <>
          {metric.key === 'journey' && <p className="infoText">{t('첫 기록 기간: {0} — {1}', [insights.journey.baseline_start, insights.journey.baseline_end])}</p>}
          <ComparisonRows items={insights[metric.key].comparisons} />
        </>}
        {metric.key === 'recovery' && <ul className="reportComparisons">{[...recovery.events].reverse().map((event) => <li key={event.return_week}>
          <strong>{event.missed_week} → {event.return_week}</strong><p>{t(event.status === 'recovered' ? '복귀 달성' : '운동 재개 · 목표 달성 확인 중')}</p><small>{t('첫 복귀일: {0}', [event.first_return_date])}</small>
        </li>)}</ul>}
        {metric.key === 'challenges' && <>
          {challenges.new_areas.length > 0 && <><h4>{t('첫 도전')}</h4><ul className="reportComparisons">{challenges.new_areas.map((area) => <li key={area.target_area}><strong>{report_area_label(area.target_area, language)}</strong><small>{area.first_date}</small></li>)}</ul></>}
        </>}
        {metric.key === 'consistency' && <ul className="reportComparisons">{[...consistency.weeks].reverse().map((week) => <li key={week.week_start}>
          <strong>{week.week_start}</strong>
          <p>{t('운동 {0}/{1}회 · {2}', [week.completed_count, week.target_count, t(week_labels[week.status])])}</p>
        </li>)}</ul>}
        {metric.key === 'preferences' && <>
          <div className="infoCaption">{t('부위별 선호')}<InfoTooltip label={t('부위별 선호')}>{t('세트를 기록한 운동일 중 해당 부위를 운동한 날의 비중이에요.')}</InfoTooltip></div>
          <ul className="reportComparisons">{preferences.map((item) => <li key={item.target_area}>
            <strong>{report_area_label(item.target_area, language)}</strong><p>{preference_text(item, language)}</p>
          </li>)}</ul>
        </>}
      </div>
    </details>)}
    {copy.metrics.length > 0 && <div className="infoCaption">{t('측정 기준과 한계')}<InfoTooltip label={t('측정 기준과 한계')}>{copy.method_messages.map((message) => <span className="infoTooltipParagraph" key={message}>{t(message)}</span>)}
      <span className="infoTooltipParagraph">{t('기록이 추가되거나 수정되면 리포트도 다시 계산돼요.')}</span>
    </InfoTooltip></div>}
      </div>
    </details>
  </article>;
}
