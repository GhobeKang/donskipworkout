'use client';

import { useLanguage } from '../../_hooks/useLanguage';
import { member_report_changes, measured_change } from '../../_lib/reportVisibility';
import { evidence_copy, performance_value } from '../../_lib/reportEvidence';
import PerformanceEvidence from '../reports/PerformanceEvidence';
import TeamGrowthGuide from '../reports/TeamGrowthGuide';
import MaterialIcon from '../ui/MaterialIcon';
import WorkoutTimeEvidence from '../reports/WorkoutTimeEvidence';

const metric_labels = {
  attendance: '개인 출석 목표 달성', volume: '총중량 변화',
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
  const evidence = report.growth_evidence || {};
  const copy = evidence_copy(evidence, language, report.attendance.current_dates.length);
  const number_formatter = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: 2 });
  const number = (value) => number_formatter.format(value);
  const change = (value, unit = '') => value > 0 ? t('{0}{1} 증가', [number(value), unit])
    : value < 0 ? t('{0}{1} 감소', [number(Math.abs(value)), unit]) : t('유지');
  const metric_values = (metric) => {
    if (metric.key === 'volume') return t('총중량 {0} → {1}kg', [number(metric.previous), number(metric.current)]);
    if (metric.previous === null && metric.key === 'attendance') return t('개인 목표 달성 {0}%', [number(metric.current)]);
    if (metric.previous === null && metric.key === 'punctuality') return t('시간 내 인증 {0}%', [number(metric.current)]);
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
  const report_exercises = report.exercises.filter((exercise) => exercise.current_logs.length || exercise.previous_logs.length);
  const goal_status_labels = { kept: '목표 달성', missed: '목표 미달', rest: '휴식', unknown: '평가 자료 부족', in_progress: '진행 중' };
  const saved_goal_periods = [...(report.attendance.previous_periods || []), ...report.attendance.periods];
  const goal_weeks = saved_goal_periods.length > 0 ? saved_goal_periods.map((period) => ({
    week_start: period.start_date, completed_count: period.completed_count, target_count: period.target_count,
    status: !Number.isFinite(period.target_count) ? 'unknown' : period.target_count === 0 ? 'rest'
      : period.completed_count >= period.target_count ? 'kept' : 'missed',
  })) : evidence.consistency?.weeks || [];
  const training_rows = [
    { key: 'attendance', label: '인증 출석', previous: report.attendance.previous_dates.length, current: report.attendance.current_dates.length, unit: '일', comparable: report.attendance.previous_dates.length > 0 },
    ...['workout_days', 'set_count', 'rep_count', 'volume_kg'].map((field) => ({
      key: field, label: exercise_field_labels[field], previous: report.previous_totals[field], current: report.current_totals[field],
      unit: { workout_days: '일', set_count: '세트', rep_count: '회', volume_kg: 'kg' }[field],
      comparable: report.previous_totals.workout_days > 0 && report.current_totals.workout_days > 0,
    })),
  ];

  return <section className="challengeMemberReport" aria-labelledby="challenge-member-report-heading">
    <header className="challengeReportDetailHeader">
      <button type="button" className="challengeReportBack" onClick={on_back}><MaterialIcon>arrow_back</MaterialIcon>{t('팀원 목록')}</button>
      <h3 id="challenge-member-report-heading" tabIndex={-1} ref={heading_ref}>{report.display_name}</h3>
      {participant_label && <span className="challengeReportBadge">{participant_label}</span>}
    </header>
    <div className="challengeGrowthHero">
      <span>{t('수행·유지·복귀의 근거')}</span>
      <h4>{copy.title}</h4>
      {copy.highlights.length > 0 && <ul className="reportEvidence">{copy.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>}
      <p>{t('총중량·세트·운동일의 증감은 훈련량 참고 지표입니다. 총중량 감소만으로 수행 저하를 판단하지 않습니다.')}</p>
      {copy.focus && <p>{copy.focus}</p>}
    </div>
    <div className="challengeReportPeriods">
      <div><span>{t('이전 기간')}</span><strong>{report.previous_period.start_date} — {report.previous_period.end_date}</strong></div>
      <div><span>{t('챌린지 기간')}</span><strong>{report.current_period.start_date} — {report.current_period.end_date}</strong></div>
    </div>
    <TeamGrowthGuide evidence={evidence} />
    {evidence.workout_time && <details className="reportSection" open>
      <summary><span>{t('운동 시간의 변화')}</span><small>{t('측정 근거 보기')}</small></summary>
      <div className="reportSectionBody"><WorkoutTimeEvidence summary={evidence.workout_time} show_days /></div>
    </details>}
    {evidence.performance && <details className="reportSection" open>
      <summary><span>{t('동일 조건의 수행 변화')}</span><strong>{performance_value(evidence.performance, language)}</strong><small>{t('측정 근거 보기')}</small></summary>
      <div className="reportSectionBody"><PerformanceEvidence performance={evidence.performance} /></div>
    </details>}
    {evidence.consistency && <details className="reportSection" open>
      <summary><span>{t('지켜온 운동 목표')}</span><strong>{evidence.consistency.period_evaluated_weeks > 0 ? t('완료된 목표 {0}/{1}주 달성', [evidence.consistency.period_kept_weeks, evidence.consistency.period_evaluated_weeks]) : t('개인 목표 평가 자료 부족')}</strong><small>{t('측정 근거 보기')}</small></summary>
      <div className="reportSectionBody">
        <p className="infoText">{t('연속 달성은 이전·현재 비교 기간 안에서만 계산합니다. 각 주는 회차 시작일부터 7일 구간입니다.')}</p>
        <table className="reportDataTable isGoals"><caption className="srOnly">{t('주차별 목표와 실제 운동')}</caption><thead><tr><th scope="col">{t('주 시작')}</th><th scope="col">{t('실제')}</th><th scope="col">{t('목표')}</th><th scope="col">{t('결과')}</th></tr></thead><tbody>{goal_weeks.map((week) => <tr key={week.week_start}>
          <th scope="row">{week.week_start}<small>{t(week.week_start < report.current_period.start_date ? '이전 기간' : '챌린지 기간')}</small></th><td>{t('운동 {0}회', [week.completed_count])}</td><td>{Number.isFinite(week.target_count) ? t('운동 {0}회', [week.target_count]) : '—'}</td><td>{t(goal_status_labels[week.status] || '평가 자료 부족')}</td>
        </tr>)}</tbody></table>
        {evidence.consistency.period_evaluated_weeks === 0 && <p className="infoText">{t('저장된 개인 목표가 없어 목표 유지와 복귀를 평가할 수 없어요.')}</p>}
      </div>
    </details>}
    {(evidence.recovery?.events.length > 0 || evidence.recovery?.opportunity_count > 0) && <details className="reportSection" open>
      <summary><span>{t('다시 돌아오는 힘')}</span><strong>{t('복귀 달성 {0}/{1}번', [evidence.recovery.recovered_count, evidence.recovery.opportunity_count])}</strong><small>{t('측정 근거 보기')}</small></summary>
      <ul className="reportComparisons reportSectionBody">{evidence.recovery.events.map((event) => <li key={event.return_week}><strong>{event.missed_week} → {event.return_week}</strong><p>{t(event.status === 'recovered' ? '복귀 달성' : event.status === 'pending' ? '운동 재개 · 목표 달성 확인 중' : event.first_return_date ? '운동 재개 · 목표 미달' : '복귀 기록 없음')}</p>{event.first_return_date && <small>{t('첫 복귀일: {0}', [event.first_return_date])}</small>}</li>)}</ul>
      {evidence.recovery.events.length === 0 && <p className="infoText reportSectionBody">{t('완료된 복귀 기회 {0}번 · 목표 달성 복귀 기록 없음', [evidence.recovery.opportunity_count])}</p>}
    </details>}
    <section className="teamTrainingTable" aria-label={t('훈련량 참고 수치')}>
      <h4>{t('훈련량 참고 수치')}</h4>
      <table className="reportDataTable"><thead><tr><th scope="col">{t('항목')}</th><th scope="col">{t('이전')}</th><th scope="col">{t('이번')}</th><th scope="col">{t('증감')}</th></tr></thead><tbody>{training_rows.map((row) => <tr key={row.key}>
        <th scope="row">{t(row.label)}</th><td>{number(row.previous)}<small>{t(row.unit)}</small></td><td>{number(row.current)}<small>{t(row.unit)}</small></td><td>{row.comparable ? change(row.current - row.previous, t(row.unit)) : t('비교 자료 부족')}</td>
      </tr>)}</tbody></table>
      <p className="infoText">{t('운동일은 세트 기록이 있는 날입니다. 훈련량 증감은 수행 판정과 별도로 봅니다.')}</p>
    </section>
    {changes.metrics.length > 0 && <details className="challengeGrowthMethod"><summary>{t('기존 활동 점수와 배점 근거 (참고)')}{Number.isFinite(report.total_score) && ` · ${number(report.total_score)}/100`}</summary>
      <p>{t('기존 활동 점수는 출석·총중량·인증 시간·추가 운동 배점입니다. 수행 향상·유지·복귀의 판정에는 사용하지 않습니다.')}</p>
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
    </details>}
    {report_exercises.length > 0 && <>
      <div className="sectionHeading"><h4>{t('종목별 수행과 변화')}</h4><span>{t('{0}개 종목', [report_exercises.length])}</span></div>
      <div className="challengeExerciseReports">{report_exercises.map((exercise) => <details className="challengeExerciseReport" key={JSON.stringify([exercise.exercise_source, exercise.exercise_id, exercise.exercise_name])}>
        <summary><span><strong>{exercise.exercise_name}</strong><small>{t('기록 {0} → {1}일 · 비교 조건 {2}개', [exercise.previous.workout_days, exercise.current.workout_days, exercise.conditions.length])}</small></span><MaterialIcon>expand_more</MaterialIcon></summary>
        <div className="challengeExerciseEvidence">
          <dl className="challengeExerciseComparison">{Object.keys(exercise_field_labels).map((field) => <div key={field}>
            <dt>{t(exercise_field_labels[field])}</dt><dd>{exercise.previous.workout_days > 0 ? number(exercise.previous[field]) : t('기록 없음')} → {exercise.current.workout_days > 0 ? number(exercise.current[field]) : t('기록 없음')}{['best_weight_kg', 'volume_kg'].includes(field) ? ' kg' : ''}</dd>
          </div>)}</dl>
          {exercise.conditions.length > 0 && <><p className="sm-text">{t('수행 해석은 동일 조건의 중량·반복 기록을 사용합니다. 총중량 변화는 별도로 표시합니다.')}</p><ul className="challengeConditionList">{exercise.conditions.map((condition) => <li key={JSON.stringify([condition.dimension, condition.condition_value])}>
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
