import { useEffect, useState } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import ActionModal from '../ui/ActionModal';
import MaterialIcon from '../ui/MaterialIcon';
import dashboard_styles from './Dashboard.module.css';

function get_workout_clock(timezone, current_time) {
  const clock_parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(current_time);
  const clock = Object.fromEntries(clock_parts.map(({ type, value }) => [type, value]));
  return { date: `${clock.year}-${clock.month}-${clock.day}`, time: `${clock.hour}:${clock.minute}` };
}

const session_display = {
  scheduled: { icon: 'schedule', label: '오늘의 운동 약속', action: '지금 출발', action_icon: 'directions_walk' },
  started: { icon: 'directions_walk', label: '출발 완료', action: '출석 인증', action_icon: 'how_to_reg' },
  completed: { icon: 'check_circle', label: '출석 완료', action: '오늘 기록 보기', action_icon: 'article' },
  rest: { icon: 'self_improvement', label: '오늘은 휴식', action: '다음 약속 정하기', action_icon: 'event' },
  missed: { icon: 'event_busy', label: '미실행', action: '다음 약속 정하기', action_icon: 'event' },
  free: { icon: 'fitness_center', label: '자유 운동', action: '출석 인증', action_icon: 'how_to_reg' },
};

export default function TodaySessionCard({ data, pending, on_action, on_checkin, on_open_record, on_open_settings }) {
  const { t } = useLanguage();
  const [selected_action, set_selected_action] = useState(null);
  const [current_time, set_current_time] = useState(() => new Date());
  const { session, workout_date, timezone } = data;
  const status = session?.session_status || (data.is_scheduled_day ? 'scheduled' : 'free');
  const display = session_display[status] || session_display.free;
  const is_scheduled = status === 'scheduled';
  const can_rest = is_scheduled || status === 'started' || status === 'free';
  const scheduled_time = session?.scheduled_time || data.workout_time;
  const current_clock = get_workout_clock(timezone, current_time);
  const is_late = is_scheduled && current_clock.date === workout_date && current_clock.time >= scheduled_time;
  const can_snooze = is_scheduled && !is_late && !session?.snooze_count && scheduled_time < '23:30';
  const snooze_label = session?.snooze_count ? '미루기 사용함' : can_snooze ? '30분 뒤에' : '미루기 불가';
  const primary_action = () => {
    if (is_scheduled) on_action('go');
    else if (status === 'completed') on_open_record(session);
    else if (status === 'rest' || status === 'missed') on_open_settings();
    else on_checkin();
  };

  useEffect(() => {
    if (!is_scheduled) return;
    const clock_timer = setInterval(() => set_current_time(new Date()), 30000);
    return () => clearInterval(clock_timer);
  }, [is_scheduled]);

  const confirm_action = (action) => {
    set_selected_action(null);
    on_action(action);
  };
  return <>
    <article className={dashboard_styles.sessionCard} aria-labelledby="today-session-heading">
      <div className={dashboard_styles.sessionContent}>
        <div className={dashboard_styles.sessionTitle}>
          <p id="today-session-label"><MaterialIcon>{display.icon}</MaterialIcon>{t(is_scheduled ? display.label : '오늘의 운동')}</p>
          <h2 id="today-session-heading" aria-describedby="today-session-label" className={is_scheduled ? dashboard_styles.scheduledTime : undefined}>
            {is_scheduled ? <time dateTime={scheduled_time}>{scheduled_time}</time> : t(display.label)}
          </h2>
        </div>
        {(data.progress_message || data.hero_quote) && <p className={dashboard_styles.coachMessage}>{data.progress_message || data.hero_quote}</p>}
        <div className={dashboard_styles.sessionActions}>
          <button className={dashboard_styles.primaryAction} type="button" disabled={pending} onClick={primary_action}>
            <MaterialIcon>{display.action_icon}</MaterialIcon>{t(display.action)}
          </button>
          {(is_scheduled || status === 'rest') && <button className={dashboard_styles.secondaryAction}
            type="button" disabled={pending} onClick={on_checkin}>{t('출석 인증')}</button>}
        </div>
      </div>
      {can_rest && <div className={dashboard_styles.scheduleOptions}>
        {is_scheduled && <button type="button" disabled={pending || !can_snooze} onClick={() => set_selected_action('snooze')}>
          <MaterialIcon>more_time</MaterialIcon>{t(snooze_label)}
        </button>}
        <button type="button" disabled={pending} onClick={() => set_selected_action('rest')}>
          <MaterialIcon>self_improvement</MaterialIcon>{t('오늘은 휴식')}
        </button>
      </div>}
    </article>
    <ActionModal action={selected_action} initial_focus="cancel" pending={pending} on_confirm={confirm_action} on_close={() => set_selected_action(null)} />
  </>;
}
