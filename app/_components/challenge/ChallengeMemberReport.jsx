'use client';

import { useLanguage } from '../../_hooks/useLanguage';
import { member_report_changes, measured_change } from '../../_lib/reportVisibility';
import MaterialIcon from '../ui/MaterialIcon';

const metric_labels = {
  attendance: '개인 출석 목표 달성', volume: '총중량의 성장',
  punctuality: '인증 시간 준수', extra: '추가 운동의 변화',
};
const metric_explanations = {
  attendance: '개인 주간 목표만큼 인증하면 출석 20점 만점입니다. 주차별 초과 출석은 출석 배점을 늘리지 않습니다.',
  volume: '총중량은 모든 세트의 중량 × 반복 수 합계입니다. 직전 동일 길이 기간보다 20% 늘면 50점 만점입니다.',
  punctuality: '예정 시각부터 2시간 이내에 인증 완료한 날의 비율로 20점을 계산합니다. 예정 전 인증과 2시간 초과 인증은 제외합니다.',
  extra: '쉬는 요일 운동 또는 주차별 목표 초과 출석이 이전보다 주당 1일 늘면 10점.',
};
const exercise_field_labels = {
  workout_days: '운동일', set_count: '총 세트', sets_per_workout: '운동일당 세트',
  rep_count: '총 반복', best_weight_kg: '최대 기록 중량', volume_kg: '총중량',
};

export default function ChallengeMemberReport({ report, heading_ref, on_back }) {
  const { language, t } = useLanguage();
  const changes = member_report_changes(report);
  const number_formatter = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: 2 });
  const number = (value) => number_formatter.format(value);
  const change = (value, unit = '') => value > 0 ? t('{0}{1} 증가', [number(value), unit])
    : t('{0}{1} 감소', [number(Math.abs(value)), unit]);
  const metric_values = (metric) => {
    if (metric.key === 'volume') return t('총중량 {0} → {1}kg', [number(metric.previous), number(metric.current)]);
    if (metric.key === 'attendance') return t('목표 달성 {0}% → {1}%', [number(metric.previous), number(metric.current)]);
    if (metric.key === 'punctuality') return t('시간 내 인증 {0}% → {1}%', [number(metric.previous), number(metric.current)]);
    return t('추가 운동 {0}일 → {1}일', [number(metric.previous), number(metric.current)]);
  };
  const certification_status = (record) => record.on_time ? t('2시간 내 인증')
    : record.timing_status === 'early' ? t('예정 전 인증 · 점수 제외') : t('2시간 초과 · 점수 제외');
  const participant_label = report.participant_status === 'withdrawn' ? t('중도 종료')
    : report.participant_status === 'removed' ? t('참여 종료') : null;
  const attendance_periods = report.attendance.periods.filter((period, index) => {
    const previous = report.attendance.previous_periods?.[index];
    return previous && (measured_change(previous.completed_count, period.completed_count)
      || measured_change(previous.credited_count, period.credited_count));
  });

  return <section className="challengeMemberReport" aria-labelledby="challenge-member-report-heading">
    <header className="challengeReportDetailHeader">
      <button type="button" className="challengeReportBack" onClick={on_back}><MaterialIcon>arrow_back</MaterialIcon>{t('팀원 목록')}</button>
      <h3 id="challenge-member-report-heading" tabIndex={-1} ref={heading_ref}>{report.display_name}</h3>
      {participant_label && <span className="challengeReportBadge">{participant_label}</span>}
    </header>
    {changes.has_changes && Number.isFinite(report.total_score) && <div className="challengeGrowthHero">
      <span>{t('성장·수행 종합 점수')}</span>
      <strong>{number(report.total_score)}<small> / 100</small></strong>
      <p>{t('종합 점수는 전체 평가 항목으로 계산하며, 상세에는 확인된 변화만 표시합니다.')}</p>
    </div>}
    <div className="challengeReportPeriods">
      <div><span>{t('이전 기간')}</span><strong>{report.previous_period.start_date} — {report.previous_period.end_date}</strong></div>
      <div><span>{t('챌린지 기간')}</span><strong>{report.current_period.start_date} — {report.current_period.end_date}</strong></div>
    </div>
    {!changes.has_changes && <p className="emptyState">{t('표시할 수 있는 변화가 없습니다.')}</p>}
    {changes.totals.length > 0 && <div className="challengeReportTotals" aria-label={t('수행 요약')}>
      {changes.totals.map((total) => <div key={total.key}><span>{t(total.label)}</span><strong>{number(total.previous)} → {number(total.current)}<small> {t(total.unit)}</small></strong></div>)}
    </div>}
    {changes.metrics.length > 0 && <><h4>{t('점수의 근거')}</h4>
      <div className="challengeGrowthMetrics">{changes.metrics.map((metric) => <details className="challengeGrowthMetric" key={metric.key}>
        <summary><span><strong>{t(metric_labels[metric.key])}</strong><small>{metric_values(metric)}</small></span><span className="challengeGrowthMetricScore">{t('{0}/{1}점', [number(metric.points), metric.max_points])}<MaterialIcon>expand_more</MaterialIcon></span></summary>
        <div className="challengeGrowthEvidence">
          <p>{t(metric_explanations[metric.key])}</p>
          {metric.key === 'volume' && <p>{metric.growth_value !== 0 ? change(metric.growth_value, '%') : change(metric.current - metric.previous, 'kg')}</p>}
          {metric.key === 'extra' && <p>{change(metric.growth_value, t('일/주'))}</p>}
          {metric.key === 'attendance' && <>
            <p>{t('개인 목표 주 {0}일 · 총 목표 {1}일 · 출석 배점 인정 {2}일', [number(metric.target_count_per_week), number(metric.target_days), metric.credited_days])}</p>
            {attendance_periods.length > 0 && <ul className="challengeReportEvidenceList">{attendance_periods.map((period) => {
              const previous = report.attendance.previous_periods[period.period_index - 1];
              return <li key={period.period_index}><span>{t('{0}주차', [period.period_index])}</span><span>{t('출석 {0}일 → {1}일', [previous.completed_count, period.completed_count])}</span></li>;
            })}</ul>}
            <div className="challengeReportDateLists"><span>{t('이전 인증일')}: {report.attendance.previous_dates.join(', ')}</span>{report.attendance.current_dates.length > 0 && <span>{t('현재 인정 출석일')}: {report.attendance.current_dates.join(', ')}</span>}</div>
          </>}
          {metric.key === 'volume' && measured_change(metric.previous_recorded_days, metric.current_recorded_days) && <p>{t('세트 기록이 있는 날 {0}일 → {1}일', [metric.previous_recorded_days, metric.current_recorded_days])}</p>}
          {metric.key === 'punctuality' && <>
            <p>{t('미루기를 적용하기 전 예정 시각을 기준으로 하며, 정확히 2시간 뒤의 인증도 인정합니다.')}</p>
            {[[t('이전 인증 기록'), report.punctuality.previous.records], [t('현재 인증 기록'), report.punctuality.current.records]].map(([label, records]) => <div key={label}>
              <strong>{label}</strong>
              <ul className="challengeReportEvidenceList">{records.map((record) => <li key={record.date}><time dateTime={record.date}>{record.date}</time><span>{t('예정 {0} · 인증 {1}', [record.scheduled_time, record.certified_time])}</span><span>{certification_status(record)}</span></li>)}</ul>
            </div>)}
          </>}
          {metric.key === 'extra' && <>
            <p>{report.extra.source === 'off_days' ? t('시작 예약 시 저장한 운동 요일을 두 기간에 동일하게 적용합니다. 도중에 바꾼 요일은 점수 기준을 바꾸지 않습니다.') : t('주차별 챌린지 목표를 초과한 출석일로 비교합니다.')}</p>
            {measured_change(report.extra.previous.above_target_days, report.extra.current.above_target_days) && <p>{t('주차별 목표 초과 출석 {0}일 → {1}일', [report.extra.previous.above_target_days, report.extra.current.above_target_days])}</p>}
            {report.extra.source === 'off_days' && report.extra.current.off_day_dates?.length > 0 && <p>{t('쉬는 요일 수행일')}: {report.extra.current.off_day_dates.join(', ')}</p>}
          </>}
        </div>
      </details>)}</div>
    </>}
    {changes.exercises.length > 0 && <>
      <div className="sectionHeading"><h4>{t('종목별 수행과 변화')}</h4><span>{t('{0}개 종목', [changes.exercises.length])}</span></div>
      <div className="challengeExerciseReports">{changes.exercises.map((exercise) => <details className="challengeExerciseReport" key={JSON.stringify([exercise.exercise_source, exercise.exercise_id, exercise.exercise_name])}>
        <summary><span><strong>{exercise.exercise_name}</strong>{exercise.changed_fields.includes('volume_kg') && <small>{t('총중량 {0}', [change(exercise.current.volume_kg - exercise.previous.volume_kg, 'kg')])}</small>}</span><MaterialIcon>expand_more</MaterialIcon></summary>
        <div className="challengeExerciseEvidence">
          {exercise.changed_fields.length > 0 && <dl className="challengeExerciseComparison">{exercise.changed_fields.map((field) => <div key={field}>
            <dt>{t(exercise_field_labels[field])}</dt><dd>{number(exercise.previous[field])} → {number(exercise.current[field])}{['best_weight_kg', 'volume_kg'].includes(field) ? ' kg' : ''}</dd>
          </div>)}</dl>}
          {exercise.conditions.length > 0 && <><p className="sm-text">{t('점수는 전체 종목의 총중량 변화로 계산합니다. 동일 조건 중량·반복 비교는 참고 상세입니다.')}</p><ul className="challengeConditionList">{exercise.conditions.map((condition) => <li key={JSON.stringify([condition.dimension, condition.condition_value])}>
            <strong>{condition.dimension === 'weight_kg' ? t('동일 {0}회 반복', [number(condition.condition_value)]) : t('동일 {0}kg 중량', [number(condition.condition_value)])}</strong>
            <span>{number(condition.previous_value)} → {number(condition.current_value)} {condition.dimension === 'weight_kg' ? 'kg' : t('회')}</span>
            <small>{change(condition.current_value - condition.previous_value, condition.dimension === 'weight_kg' ? 'kg' : t('회'))} · {condition.previous_date} → {condition.current_date}</small>
          </li>)}</ul></>}
          {[[t('현재 수행 내역'), exercise.current_logs], [t('이전 수행 내역'), exercise.previous_logs]].map(([label, logs]) => logs.length > 0 && <details className="challengeWorkoutLogs" key={label}>
            <summary>{label} · {logs.length}{t('일')}</summary>
            {logs.map((log) => <div key={log.date}><time dateTime={log.date}>{log.date}</time><ol>{log.sets.map((set, index) => <li key={index}>{index + 1}. {number(set.weight_kg)} kg × {set.reps}{t('회')}</li>)}</ol></div>)}
          </details>)}
        </div>
      </details>)}</div>
    </>}
    {changes.has_changes && <details className="challengeGrowthMethod">
      <summary>{t('점수 계산 방식과 데이터 한계')}</summary>
      <p>{t('출석 20점, 총중량 성장 50점, 인증 시간 준수 20점, 추가 운동 성장 10점의 합계입니다.')}</p>
      <p>{t('출석일과 기간은 챌린지의 서울 기준입니다. 수행 내역과 인증 시각 표시는 팀원의 운동일·시간대 기준입니다.')}</p>
      <p>{t('결과 확인 중에는 기록 보완으로 값이 바뀔 수 있습니다. 결과 확정 후에는 저장된 리포트를 보여줍니다.')}</p>
      {report.snapshot_origin === 'historical_backfill' && <p>{t('기존에 확정된 회차는 최초 리포트 조회 시 남아 있는 기록으로 생성했습니다. 당시 정산 시점의 운동 기록을 복원한 값은 아닙니다.')}</p>}
      {report.snapshot_origin === 'criteria_recalculation' && <p>{t('평가 기준 변경으로 남아 있는 기록을 사용해 한 번 재산정했습니다. 이전 버전 리포트는 보관되며, 이후 기록 수정으로 이번 점수가 바뀌지 않습니다.')}</p>}
      <p>{t('계산 시각')}: <time dateTime={report.computed_at}>{report.computed_at.slice(0, 19).replace('T', ' ')} UTC</time></p>
    </details>}
  </section>;
}
