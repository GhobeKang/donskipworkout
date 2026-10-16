import { translate } from './i18n';

export function format_workout_duration(total_seconds, language) {
  const t = (message, values = []) => translate(message, values, language);
  if (!Number.isFinite(total_seconds) || total_seconds < 0) return t('미측정');
  const measured_seconds = Math.floor(total_seconds);
  const hours = Math.floor(measured_seconds / 3600);
  const minutes = Math.floor(measured_seconds % 3600 / 60);
  const seconds = measured_seconds % 60;
  const parts = [];
  if (hours) parts.push(t('{0}시간', [hours]));
  if (minutes) parts.push(t('{0}분', [minutes]));
  if (seconds || !parts.length) parts.push(t('{0}초', [seconds]));
  return parts.join(' ');
}

export function workout_time_value(summary, language) {
  const t = (message, values = []) => translate(message, values, language);
  const previous_duration = format_workout_duration(summary.previous.measured_seconds, language);
  const current_duration = format_workout_duration(summary.current.measured_seconds, language);
  return summary.comparable ? `${previous_duration} → ${current_duration}`
    : t('이번 기간 {0} · 이전 기간 {1}', [current_duration, previous_duration]);
}

export const workout_time_method = '종료된 타이머의 확정 구간만 합산하며 일시정지는 제외합니다. 자정을 넘으면 사용자 시간대의 날짜별로 나눕니다. 평균은 측정한 운동일만 기준으로 하고 미측정일은 0분으로 계산하지 않습니다. 시간당 세트는 시간과 세트가 함께 기록된 날만 계산합니다. 운동 시간이나 시간당 세트 증가만으로 수행 향상을 판단하거나 성장 점수를 올리지 않습니다.';

export function workout_time_report_lines(summary, language) {
  const t = (message, values = []) => translate(message, values, language);
  const number_formatter = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: 2 });
  return ['previous', 'current'].flatMap((period) => {
    const totals = summary[period];
    const period_label = t(period === 'previous' ? '이전 기간' : '이번 기간');
    return [
      `${period_label} | ${format_workout_duration(totals.measured_seconds, language)} | ${t('측정 {0}일', [totals.measured_days])}`,
      `${t('측정 운동일 평균')} | ${format_workout_duration(totals.average_seconds, language)}`,
      `${t('타이머 측정')} | ${format_workout_duration(totals.timer_recorded_seconds, language)} | ${t('직접 보정')} | ${format_workout_duration(totals.self_reported_seconds, language)}`,
      `${t('시간당 수행 세트')} | ${Number.isFinite(totals.sets_per_hour) ? t('{0}세트/시간', [number_formatter.format(totals.sets_per_hour)]) : t('비교 자료 부족')} | ${t('시간과 세트가 함께 기록된 {0}일 기준', [totals.timed_set_days])}`,
      ...totals.days.map((day) => `${day.workout_date} | ${format_workout_duration(day.measured_seconds, language)} | ${t('타이머 측정')} ${format_workout_duration(day.timer_recorded_seconds, language)} | ${t('직접 보정')} ${format_workout_duration(day.self_reported_seconds, language)}`),
    ];
  });
}
