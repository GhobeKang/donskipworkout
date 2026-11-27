import { useLanguage } from '../../_hooks/useLanguage';
import { format_workout_date } from '../../_lib/i18n';
import FirstUseGuide from '../help/FirstUseGuide';
import HelpLink from '../help/HelpLink';
import CommunityOverview from '../today/CommunityOverview';
import TodaySessionCard from '../today/TodaySessionCard';
import WeeklyAttendance from '../today/WeeklyAttendance';
import dashboard_styles from '../today/Dashboard.module.css';
import MaterialIcon from '../ui/MaterialIcon';
import WorkoutTimer from '../workout/WorkoutTimer';

export default function TodayScreen({
  user_uuid, data, pending, revision, on_unauthorized, on_action, on_checkin,
  on_open_record, on_open_records, on_open_workout, on_open_settings, on_navigate, on_refresh,
}) {
  const { t, language } = useLanguage();
  const { session, weekly_attendance, memory, workout_date } = data;
  const date_label = format_workout_date(workout_date, language, { month: 'long', day: 'numeric', weekday: 'long' });

  return <section className={dashboard_styles.dashboard} aria-labelledby="today-title">
    <header className={dashboard_styles.pageHeader}>
      <div><h1 id="today-title">{t('오늘')}</h1><time dateTime={workout_date}>{date_label}</time></div>
      <button type="button" className={dashboard_styles.refreshButton} disabled={pending}
        aria-label={t('최신 기록 불러오기')} title={t('최신 기록 불러오기')} onClick={on_refresh}>
        <MaterialIcon>refresh</MaterialIcon>
      </button>
    </header>
    <div className={dashboard_styles.columns}>
      <div className={dashboard_styles.column}>
        <TodaySessionCard data={data} pending={pending} on_action={on_action} on_checkin={on_checkin}
          on_open_record={on_open_record} on_open_settings={on_open_settings} />
        <section className={dashboard_styles.panel} aria-labelledby="workout-tools-title">
          <h2 id="workout-tools-title">{t('운동 도구')}</h2>
          <button className={dashboard_styles.toolRow} type="button" disabled={pending} onClick={on_open_workout}>
            <span className={dashboard_styles.toolIcon}><MaterialIcon>fitness_center</MaterialIcon></span>
            <strong>{t('세트 기록')}</strong><MaterialIcon>chevron_right</MaterialIcon>
          </button>
          <WorkoutTimer user_uuid={user_uuid} is_active on_unauthorized={on_unauthorized} />
        </section>
      </div>
      <div className={dashboard_styles.column}>
        <CommunityOverview user_uuid={user_uuid} revision={revision} pending={pending} on_unauthorized={on_unauthorized}
          on_navigate={on_navigate} on_refresh={on_refresh} />
        <WeeklyAttendance workout_date={workout_date} attendance={weekly_attendance}
          session_status={session?.session_status || (data.is_scheduled_day ? 'scheduled' : undefined)}
          revision={revision} on_unauthorized={on_unauthorized}
          on_open_records={on_open_records} on_open_settings={on_open_settings} />
        {memory && <section className={dashboard_styles.panel} aria-labelledby="past-checkin-title">
          <h2 id="past-checkin-title">{t('다시 보는 출석')}</h2>
          <button className={dashboard_styles.memoryRow} type="button" disabled={pending} onClick={() => on_open_record(memory)}>
            <span className={dashboard_styles.dateTile} aria-hidden="true">
              <span>{format_workout_date(memory.workout_date, language, { month: 'short' })}</span>
              <b>{Number(memory.workout_date.slice(-2))}</b>
            </span>
            <span className={dashboard_styles.memorySummary}>
              <strong>{memory.note || memory.title}</strong>
              <time dateTime={memory.workout_date}>{format_workout_date(memory.workout_date, language, { year: 'numeric', month: 'short', day: 'numeric' })}</time>
            </span>
            <MaterialIcon>chevron_right</MaterialIcon>
          </button>
        </section>}
        <FirstUseGuide />
        <HelpLink question_id="attendance">{t('세트 기록과 출석은 어떻게 다른가요?')}</HelpLink>
      </div>
    </div>
  </section>;
}
