import WeeklyAttendance from '../today/WeeklyAttendance';
import { format_workout_date } from '../../_lib/i18n';
import { useLanguage } from '../../_hooks/useLanguage';
import { useEffect, useState } from 'react';
import MaterialIcon from '../ui/MaterialIcon';
import ActionModal from '../ui/ActionModal';

function get_workout_clock(timezone, current_time) {
  const clock_parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(current_time);
  const clock_values = Object.fromEntries(clock_parts.map(({ type, value }) => [type, value]));
  return {
    date: `${clock_values.year}-${clock_values.month}-${clock_values.day}`,
    seconds: Number(clock_values.hour) * 3600
      + Number(clock_values.minute) * 60
      + Number(clock_values.second),
  };
}

function is_workout_time_late(workout_date, workout_time, timezone, current_time) {
  if (!workout_date || !workout_time) return false;
  const [scheduled_hour, scheduled_minute] = workout_time.split(':').map(Number);
  if (Number.isNaN(scheduled_hour) || Number.isNaN(scheduled_minute)) return false;
  const current_clock = get_workout_clock(timezone, current_time);
  return workout_date === current_clock.date
    && scheduled_hour * 3600 + scheduled_minute * 60 < current_clock.seconds;
}

export default function TodayScreen({ data, pending, revision, on_unauthorized, on_action, on_checkin, on_open_memory, on_open_records, on_open_workout, on_open_settings, on_refresh }) {
  const { t, language } = useLanguage();
  const [selected_action, set_selected_action] = useState(null);
  const [current_time, set_current_time] = useState(() => new Date());
  const { session, weekly_attendance, memory } = data;
  const session_status = session?.session_status;
  const is_finished = ['completed', 'rest', 'missed'].includes(session_status);
  const can_start = !is_finished && session_status !== 'started' && (data.is_scheduled_day || session);
  const scheduled_time = session?.scheduled_time || data.workout_time;
  const is_scheduled_session = session_status === 'scheduled' || (!session && data.is_scheduled_day);
  const is_scheduled_late = is_scheduled_session && is_workout_time_late(data.workout_date, scheduled_time, data.timezone, current_time);
  const can_snooze = can_start && !session?.snooze_count && !is_scheduled_late;
  const is_completed = session_status === 'completed';
  const is_rest = session_status === 'rest';
  const hero_title = is_completed ? t('갔다가 오니 별거 아니지?') : is_rest ? t('쉴 땐 제대로 쉬고\n다시 와.') : t('핑계 댈 시간에\n일단 가자.');
  const action_label = is_completed ? t('오늘 기록 보기') : is_finished ? t('다음 약속 정하기') : session_status === 'started' ? t('운동했으면, 인증해.') : can_start ? t('지금 출발') : t('오늘도 출석하기');
  const primary_action = () => {
    if (is_completed) on_open_memory(session);
    else if (is_finished) on_open_settings();
    else if (can_start) on_action('go');
    else on_checkin();
  };
  useEffect(() => {
    const clock_timer = setInterval(() => set_current_time(new Date()), 30000);
    return () => clearInterval(clock_timer);
  }, []);
  const open_action_modal = (action) => set_selected_action(action);
  const confirm_action = (action) => {
    set_selected_action(null);
    on_action(action);
  };
  return <section className="viewPanel todayScreen isVisible">
    <header className="pageHeader"><div><p className="eyebrow">{format_workout_date(data.workout_date, language, { month: 'long', day: 'numeric', weekday: 'long' })}</p><h1>{hero_title}</h1></div></header>
    <WeeklyAttendance workout_date={data.workout_date} attendance={weekly_attendance} session_status={session_status} revision={revision} on_unauthorized={on_unauthorized} on_open_records={on_open_records} />
    <article className="todayActionCard">
      <div className="sectionHeading"><p className="eyebrow">{is_completed ? t('출석 완료') : is_rest ? t('오늘은 회복') : session_status === 'started' ? t('출발 완료') : t('오늘의 운동 약속')}</p>{is_scheduled_late && <span className="lateBadge">{t('늦어도, 가.')}</span>}</div>
      <div className={'sessionTime' + (is_finished || (!data.is_scheduled_day && !session) ? ' isMessage' : '')}>{is_completed ? t('해냈다.') : is_rest ? t('회복도 실력.') : session_status === 'missed' ? t('다시 시작.') : data.is_scheduled_day || session ? scheduled_time : t('지금이 타이밍.')}</div>
      <p className="sessionMessage">{is_rest ? t('휴식은 계획대로. 복귀도 계획대로.') : data.progress_message || data.hero_quote}</p>
      <button className="wideButton primary" type="button" disabled={pending} onClick={primary_action}><MaterialIcon>{is_completed ? 'check_circle' : is_finished ? 'event' : session_status === 'started' ? 'photo_camera' : 'north_east'}</MaterialIcon>{pending ? t('기록 중…') : action_label}</button>
      {!is_finished && <div className="secondaryActions">{can_start && <button className="quietButton" type="button" disabled={pending || !can_snooze} onClick={() => open_action_modal('snooze')}>{is_scheduled_late ? t('미루기 불가') : session?.snooze_count ? t('미루기 사용함') : t('30분 뒤에')}</button>}<button className="quietButton" type="button" disabled={pending} onClick={() => open_action_modal('rest')}>{t('오늘은 휴식')}</button></div>}
    </article>
    {!is_finished && <button className="quietButton directCheckin" type="button" disabled={pending} onClick={on_checkin}><MaterialIcon>photo_camera</MaterialIcon>{t('이미 운동했다면, 바로 인증')}</button>}
    <section className="memorySection"><div className="sectionHeading"><h2>{t('지난번의 나')}</h2><button className="quietButton" type="button" disabled={pending} onClick={on_open_workout}>{t('세트 기록')}<MaterialIcon>arrow_forward</MaterialIcon></button></div>{memory ? <button type="button" className="memoryRow" disabled={pending} onClick={() => on_open_memory(memory)}><span className="memoryIcon"><MaterialIcon>fitness_center</MaterialIcon></span><span className="memorySummary"><strong>{memory.note || memory.title}</strong><time dateTime={memory.workout_date}>{format_workout_date(memory.workout_date, language)}</time></span><MaterialIcon>chevron_right</MaterialIcon></button> : <p className="emptyState">{t('보여줄 과거는 아직 없다. 오늘부터 남기자.')}</p>}</section>
    <button className="quietButton refreshButton" type="button" disabled={pending} onClick={on_refresh}><MaterialIcon>refresh</MaterialIcon>{t('최신 기록 불러오기')}</button>
    <ActionModal action={selected_action} pending={pending} on_confirm={confirm_action} on_close={() => set_selected_action(null)} />
  </section>;
}
