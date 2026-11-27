import { useEffect, useState } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import { api_request } from '../../_lib/api';
import { format_workout_date } from '../../_lib/i18n';
import MaterialIcon from '../ui/MaterialIcon';
import weekly_styles from './WeeklyAttendance.module.css';

const weekday_labels = {
  ko: ['일', '월', '화', '수', '목', '금', '토'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
const attendance_states = {
  completed: { label: '운동 완료', mark: '✓' },
  rest: { label: '휴식', mark: '−' },
  missed: { label: '미실행', mark: '×' },
  started: { label: '출발', mark: '↗' },
  scheduled: { label: '운동 예정', mark: '◷' },
};

function get_week_days(workout_date) {
  const week_start = new Date(`${workout_date}T12:00:00Z`);
  week_start.setUTCDate(week_start.getUTCDate() - (week_start.getUTCDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, day_index) => {
    const day_date = new Date(week_start);
    day_date.setUTCDate(week_start.getUTCDate() + day_index);
    return { workout_date: day_date.toISOString().slice(0, 10), day_number: day_date.getUTCDate(), weekday: day_date.getUTCDay() };
  });
}

export default function WeeklyAttendance({ workout_date, attendance, session_status, revision, on_unauthorized, on_open_records, on_open_settings }) {
  const { t, language } = useLanguage();
  const [week_resource, set_week_resource] = useState(null);
  const week_days = get_week_days(workout_date);
  const request_key = `${workout_date}:${revision}`;

  useEffect(() => {
    const controller = new AbortController();
    const month_keys = [...new Set(get_week_days(workout_date).map((day) => day.workout_date.slice(0, 7)))];
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
      set_week_resource({ request_key, statuses, error: false });
    }).catch((error) => {
      if (controller.signal.aborted) return;
      if (error.status === 401) on_unauthorized();
      set_week_resource({ request_key, statuses: {}, error: true });
    });
    return () => controller.abort();
  }, [workout_date, request_key, on_unauthorized]);

  const current_week = week_resource?.request_key === request_key ? week_resource : null;
  const missing_status_label = current_week?.error ? '출석 정보 확인 불가'
    : current_week ? '완료 기록 없음' : '출석 정보 확인 중';
  return <section className={weekly_styles.card} aria-labelledby="weekly-attendance-heading">
    <header className={weekly_styles.header}>
      <h2 id="weekly-attendance-heading">{t('이번 주 출석')}</h2>
      <button type="button" className={weekly_styles.link} onClick={on_open_records}>
        {t('기록 보기')}<MaterialIcon>chevron_right</MaterialIcon>
      </button>
    </header>
    <div className={weekly_styles.summary}>
      <strong>{t('{0}회 완료', [attendance.completed_count])}</strong>
      {attendance.target_count > 0 ? <span>{t('목표 {0}회', [attendance.target_count])}</span> :
        <button type="button" className={weekly_styles.link} onClick={on_open_settings}>
          {t('운동 요일 설정')}<MaterialIcon>chevron_right</MaterialIcon>
        </button>}
    </div>
    <ol className={weekly_styles.days} role="list">
      {week_days.map((day) => {
        const is_today = day.workout_date === workout_date;
        const day_status = is_today && session_status ? session_status : current_week?.statuses[day.workout_date];
        const day_state = attendance_states[day_status];
        const day_description = `${format_workout_date(day.workout_date, language, { month: 'short', day: 'numeric', weekday: 'long' })} · ${t(day_state?.label || missing_status_label)}`;
        return <li key={day.workout_date} data-status={day_status} aria-current={is_today ? 'date' : undefined} title={day_description}>
          <span className="srOnly">{day_description}</span>
          <span aria-hidden="true" className={weekly_styles.weekday}>{is_today ? t('오늘') : weekday_labels[language][day.weekday]}</span>
          <time aria-hidden="true" dateTime={day.workout_date} className={weekly_styles.date}>
            {day.day_number}{day_state && <span className={weekly_styles.mark}>{day_state.mark}</span>}
          </time>
        </li>;
      })}
    </ol>
    {!current_week && <p role="status" className={weekly_styles.message}>{t('출석 정보 확인 중')}</p>}
    {current_week?.error && <p role="status" className={weekly_styles.message}>{t('요일별 출석을 불러오지 못했습니다. 기록 탭에서 다시 확인해 주세요.')}</p>}
  </section>;
}
