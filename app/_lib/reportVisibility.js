const area_fields = ['session_count', 'set_count', 'rep_count', 'volume_kg'];
const exercise_fields = ['workout_days', 'set_count', 'sets_per_workout', 'rep_count', 'best_weight_kg', 'volume_kg'];

export function measured_change(previous_value, current_value) {
  return Number.isFinite(previous_value) && Number.isFinite(current_value)
    && Math.abs(current_value - previous_value) > 0.000001;
}

function changed_fields(previous, current, fields) {
  return fields.filter((field) => measured_change(previous?.[field], current?.[field]));
}

function visible_comparisons(summary) {
  const comparisons = (summary?.comparisons || []).flatMap((item) => {
    if (item.direction === 'uncomparable' || !(item.previous?.session_count > 0)
      || !(item.current?.session_count > 0) || !(item.previous?.set_count > 0)
      || !(item.current?.set_count > 0)) return [];
    const fields = changed_fields(item.previous, item.current, area_fields);
    if (!fields.length) return [];
    const has_increase = fields.some((field) => item.current[field] > item.previous[field]);
    const has_decrease = fields.some((field) => item.current[field] < item.previous[field]);
    return [{ ...item, changed_fields: fields, direction: has_increase && has_decrease ? 'mixed' : has_increase ? 'improved' : 'declined' }];
  });
  return { ...summary, comparisons };
}

export function personal_report_changes(report) {
  const insights = report.insights;
  const in_period = (date) => date && date >= report.period_start && date <= report.as_of_date;
  const weeks = [];
  let previous_week = null;
  for (const week of insights.consistency.weeks) {
    if (!['kept', 'missed'].includes(week.status) || !(week.target_count > 0)
      || !Number.isFinite(week.completed_count)) {
      previous_week = null;
      continue;
    }
    const week_end = new Date(`${week.week_start}T00:00:00Z`);
    week_end.setUTCDate(week_end.getUTCDate() + 6);
    if (previous_week && in_period(week_end.toISOString().slice(0, 10))
      && (measured_change(previous_week.completed_count, week.completed_count)
        || previous_week.status !== week.status)) weeks.push({ ...week, previous: previous_week });
    previous_week = week;
  }
  const recovery_events = insights.recovery.events.filter((event) => event.status === 'recovered'
    && in_period(event.first_return_date));
  const new_areas = insights.challenges.new_areas.filter((area) => area.target_area !== '타겟 부위 미설정'
    && in_period(area.first_date));
  const personal_record_areas = insights.challenges.personal_record_areas.filter((area) => area.target_area !== '타겟 부위 미설정'
    && Number.isFinite(area.record_count) && area.record_count > 0);
  const preferences = insights.preferences.filter((item) => item.target_area !== '타겟 부위 미설정'
    && Number.isFinite(item.session_percent) && Number.isFinite(item.previous_session_percent)
    && Number.isFinite(item.session_count) && Number.isFinite(item.previous_session_count)
    && (measured_change(item.previous_session_count, item.session_count)
      || measured_change(item.previous_session_percent, item.session_percent)));
  const recent = visible_comparisons(insights.recent);
  const journey = visible_comparisons(insights.journey);
  recent.comparisons = recent.comparisons.filter((item) => item.target_area !== '타겟 부위 미설정');
  journey.comparisons = journey.comparisons.filter((item) => item.target_area !== '타겟 부위 미설정');
  return {
    ...insights, recent, journey, preferences,
    consistency: { ...insights.consistency, weeks },
    recovery: { ...insights.recovery, events: recovery_events },
    challenges: { ...insights.challenges, new_areas, personal_record_areas },
  };
}

export function member_report_changes(report) {
  const metrics = report.metrics.filter((metric) => {
    if (!metric.comparable || !Number.isFinite(metric.points)
      || !measured_change(metric.previous, metric.current)) return false;
    if (['volume', 'extra'].includes(metric.key) && !Number.isFinite(metric.growth_value)) return false;
    if (metric.key === 'attendance') return report.attendance.previous_dates.length > 0;
    if (metric.key === 'punctuality') return ['previous', 'current'].every((period) => {
      const timing = report.punctuality[period];
      return timing.measured_days > 0 && timing.missing_days === 0
        && timing.records.length === timing.attendance_days
        && timing.records.every((record) => record.scheduled_time && record.certified_at);
    });
    return true;
  });
  const exercises = report.exercises.flatMap((exercise) => {
    if (exercise.exercise_source === 'deleted' || !(exercise.previous?.workout_days > 0)
      || !(exercise.current?.workout_days > 0) || !(exercise.previous?.set_count > 0)
      || !(exercise.current?.set_count > 0)) return [];
    const fields = changed_fields(exercise.previous, exercise.current, exercise_fields);
    const conditions = exercise.conditions.filter((condition) => condition.previous_date && condition.current_date
      && measured_change(condition.previous_value, condition.current_value));
    if (!fields.length && !conditions.length) return [];
    return [{ ...exercise, changed_fields: fields, conditions }];
  });
  const totals = [];
  if (report.attendance.previous_dates.length > 0
    && measured_change(report.attendance.previous_dates.length, report.attendance.current_dates.length)) {
    totals.push({ key: 'attendance', label: '인증 출석', previous: report.attendance.previous_dates.length, current: report.attendance.current_dates.length, unit: '일' });
  }
  if (report.previous_totals.workout_days > 0 && report.current_totals.workout_days > 0) {
    if (measured_change(report.previous_totals.set_count, report.current_totals.set_count)) {
      totals.push({ key: 'sets', label: '수행 세트', previous: report.previous_totals.set_count, current: report.current_totals.set_count, unit: '세트' });
    }
    if (report.metrics.some((metric) => metric.key === 'volume' && metric.comparable)
      && measured_change(report.previous_totals.volume_kg, report.current_totals.volume_kg)) {
      totals.push({ key: 'volume', label: '총중량', previous: report.previous_totals.volume_kg, current: report.current_totals.volume_kg, unit: 'kg' });
    }
  }
  return { metrics, exercises, totals, has_changes: Boolean(metrics.length || exercises.length || totals.length) };
}
