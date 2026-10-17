import { useEffect, useState } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import { api_request } from '../../_lib/api';
import { format_workout_date } from '../../_lib/i18n';

const weekday_labels = ['일', '월', '화', '수', '목', '금', '토'];

function get_week_days(workout_date) {
  const week_start = new Date(`${workout_date}T12:00:00Z`);
  week_start.setUTCDate(week_start.getUTCDate() - (week_start.getUTCDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, day_index) => {
    const day_date = new Date(week_start);
    day_date.setUTCDate(week_start.getUTCDate() + day_index);
    return { workout_date: day_date.toISOString().slice(0, 10), day_number: day_date.getUTCDate(), weekday: day_date.getUTCDay() };
  });
}

export default function WeeklyAttendance({ workout_date, attendance, session_status, revision, on_unauthorized, on_open_records }) {
  const { t, language } = useLanguage();
  const [week_resource, set_week_resource] = useState({ workout_date: '', statuses: {}, error: false });
  const week_days = get_week_days(workout_date);

  useEffect(() => {
    const controller = new AbortController();
    const month_keys = [...new Set(get_week_days(workout_date).map((day) => day.workout_date.slice(0, 7)))];
    set_week_resource({ workout_date: '', statuses: {}, error: false });
    Promise.all(month_keys.map((month_key) => {
      const [year, month] = month_key.split('-');
      return api_request(`/records?year=${year}&month=${Number(month)}&limit=1`, { signal: controller.signal });
    })).then((month_results) => {
      if (controller.signal.aborted) return;
      const statuses = {};
      for (const { calendar } of month_results) {
        for (const [day, status] of Object.entries(calendar.day_statuses || {})) {
          statuses[`${calendar.year}-${String(calendar.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`] = status;
        }
      }
      set_week_resource({ workout_date, statuses, error: false });
    }).catch((error) => {
      if (controller.signal.aborted) return;
      if (error.status === 401) on_unauthorized();
      set_week_resource({ workout_date, statuses: {}, error: true });
    });
    return () => controller.abort();
  }, [workout_date, revision, on_unauthorized]);

  const week_loaded = week_resource.workout_date === workout_date && !week_resource.error;
  return <section className="weeklyAttendance" aria-labelledby="weekly-attendance-heading">
    <div className="sectionHeading"><h2 id="weekly-attendance-heading">{t('이번 주, 몇 번 왔나.')}</h2><button type="button" className="quietButton" onClick={on_open_records}>{attendance.target_count ? t('{0} / {1}회 완료', [attendance.completed_count, attendance.target_count]) : t('{0}회 완료', [attendance.completed_count])}</button></div>
    <div className="weekStrip">
      {week_days.map((day) => {
        const is_today = day.workout_date === workout_date;
        const day_status = is_today && session_status ? session_status : week_loaded ? week_resource.statuses[day.workout_date] : null;
        const state_label = day_status === 'completed' ? t('운동 완료') : day_status === 'rest' ? t('휴식') : day_status === 'missed' ? t('미실행') : day_status === 'started' ? t('출발') : !week_loaded ? t('출석 정보 확인 중') : t('완료 기록 없음');
        return <div className="weekDay" key={day.workout_date} aria-label={`${format_workout_date(day.workout_date, language)} · ${state_label}`} aria-current={is_today ? 'date' : undefined}>
          <span className="weekDayLabel">{language === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.weekday] : weekday_labels[day.weekday]}</span>
          <span className={`weekDayMark${is_today ? ' isToday' : ''}${day_status ? ` is${day_status}` : ''}`} aria-hidden="true">{day_status === 'completed' ? '✓' : day_status === 'rest' ? '−' : day_status === 'missed' ? '×' : day.day_number}</span>
        </div>;
      })}
    </div>
    <p className="infoText">{week_resource.error ? t('요일별 출석을 불러오지 못했습니다. 기록 탭에서 다시 확인해 주세요.') : attendance.target_count === 0 ? t('설정에서 운동 요일을 정해보세요.') : attendance.remaining_count ? t('목표까지 {0}회. 말보다 출석.', [attendance.remaining_count]) : t('이번 주 약속, 전부 지켰다.')}</p>
  </section>;
}
