import { useLanguage } from '../../_hooks/useLanguage';
import { useEffect, useRef, useState } from 'react';
import useApiResource from '../../_hooks/useApiResource';
import { api_request } from '../../_lib/api';
import { clear_workout_notifications, sync_workout_notifications } from '../../_lib/notifications';
import BottomNavigation from '../layout/BottomNavigation';
import StatusBar from '../layout/StatusBar';
import CheckinScreen from '../screens/CheckinScreen';
import RecordsScreen from '../screens/RecordsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import TodayScreen from '../screens/TodayScreen';
import WorkoutLogScreen from '../screens/WorkoutLogScreen';
import WorkoutRecordScreen from '../screens/WorkoutRecordScreen';
import WorkoutScreen from '../screens/WorkoutScreen';
import RequestState from '../ui/RequestState';
import Toast from '../ui/Toast';
import LanguageSelector from '../settings/LanguageSelector';

export default function AuthenticatedApp({ user, on_unauthorized, on_logout }) {
  const { t, language, localize_message } = useLanguage();
  const [current_view, set_current_view] = useState('today');
  const [record_navigation, set_record_navigation] = useState(null);
  const [selected_workout_record, set_selected_workout_record] = useState(null);
  const [revision, set_revision] = useState(0);
  const [today_revision, set_today_revision] = useState(0);
  const [exercise_catalog_revision, set_exercise_catalog_revision] = useState(0);
  const [pending, set_pending] = useState(false);
  const [toast_message, set_toast_message] = useState('');
  const [mutation_error, set_mutation_error] = useState('');
  const mutation_controller = useRef(null);
  const notification_sync_id = useRef(0);
  const notification_sync_queue = useRef(Promise.resolve());
  const today = useApiResource('/today', `${revision}:${today_revision}`, on_unauthorized);
  const settings = useApiResource('/settings', revision, on_unauthorized);
  const options = useApiResource('/settings/options', revision, on_unauthorized);
  const notification_catalog = useApiResource('/notifications/catalog', revision, on_unauthorized);
  const refresh_data = () => set_revision((value) => value + 1);
  const refresh_today = () => set_today_revision((value) => value + 1);
  const refresh_exercise_catalog = () => set_exercise_catalog_revision((value) => value + 1);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [current_view]);
  useEffect(() => () => mutation_controller.current?.abort(), []);
  useEffect(() => {
    const refresh_on_resume = () => {
      if (document.visibilityState === 'visible') set_revision((value) => value + 1);
    };
    document.addEventListener('visibilitychange', refresh_on_resume);
    window.addEventListener('online', refresh_on_resume);
    return () => {
      document.removeEventListener('visibilitychange', refresh_on_resume);
      window.removeEventListener('online', refresh_on_resume);
    };
  }, []);
  useEffect(() => {
    if (!settings.data || !today.data) return undefined;
    let cancelled = false;
    const current_sync_id = ++notification_sync_id.current;
    const sync_promise = notification_sync_queue.current
      .catch(() => {})
      .then(() => {
        if (cancelled) return { skipped: true };
        return sync_workout_notifications({
          settings: settings.data,
          today_data: today.data,
          notification_catalog: notification_catalog.data,
        });
      });
    notification_sync_queue.current = sync_promise;
    sync_promise
      .then((result) => {
        if (cancelled || current_sync_id !== notification_sync_id.current || result.permission !== 'denied') return;
        set_toast_message(t("알림 권한이 꺼져 있어 기기 알림을 예약하지 못했습니다."));
      })
      .catch((error) => {
        if (!cancelled && current_sync_id === notification_sync_id.current) set_toast_message(error.message || t("기기 알림을 예약하지 못했습니다."));
      });
    return () => { cancelled = true; };
  }, [settings.data, today.data, notification_catalog.data, language]);
  useEffect(() => () => {
    notification_sync_queue.current = notification_sync_queue.current
      .catch(() => {})
      .then(() => clear_workout_notifications());
  }, []);
  useEffect(() => {
    if (!toast_message) return undefined;
    const toast_timer = setTimeout(() => set_toast_message(''), 4500);
    return () => clearTimeout(toast_timer);
  }, [toast_message]);

  const mutate = async (path, method, body, success_message) => {
    if (mutation_controller.current) return false;
    const controller = new AbortController();
    mutation_controller.current = controller;
    set_pending(true);
    set_mutation_error('');
    try {
      await api_request(path, { method, body, signal: controller.signal });
      if (controller.signal.aborted) return false;
      refresh_data();
      set_toast_message(success_message);
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      if (error.status === 401) on_unauthorized();
      else { set_mutation_error(error.message); refresh_data(); }
      return false;
    } finally {
      mutation_controller.current = null;
      if (!controller.signal.aborted) set_pending(false);
    }
  };
  const act_today = (action, note) => mutate('/sessions/today/actions', 'POST', {
    action, ...(note !== undefined ? { note } : {}),
  }, { go: t("출발로 기록했습니다."), snooze: t("30분 뒤로 미뤘습니다."), manual: t("출석을 완료했습니다."), rest: t("오늘을 휴식으로 기록했습니다.") }[action]);
  const logout = async () => {
    if (mutation_controller.current) return;
    const controller = new AbortController();
    mutation_controller.current = controller;
    set_pending(true);
    let logout_message = t("모든 기기에서 로그아웃했습니다.");
    try {
      await api_request('/auth/logout', { method: 'POST', body: {}, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.status !== 401) logout_message = t("이 화면에서 로그아웃했습니다. 서버 연결 실패로 다른 기기의 로그인은 남아 있을 수 있습니다.");
    } finally {
      mutation_controller.current = null;
      if (!controller.signal.aborted) on_logout(logout_message);
    }
  };
  const navigate_to = (view) => {
    if (pending) return;
    set_mutation_error('');
    set_record_navigation(null);
    set_selected_workout_record(null);
    set_current_view(view);
  };
  const open_memory_record = (record) => {
    if (pending) return;
    set_mutation_error('');
    set_record_navigation({ workout_date: record.workout_date, session_uuid: record.session_uuid });
    set_current_view('record');
  };
  const open_workout_record = (record) => {
    if (pending) return;
    set_mutation_error('');
    set_record_navigation({ workout_date: record.workout_date, session_uuid: record.session_uuid });
    set_selected_workout_record(record);
    set_current_view('record-detail');
  };
  const today_pending = pending || today.loading || Boolean(today.error);
  return <div className="phoneShell">
    <StatusBar on_open_settings={() => navigate_to('settings')} settings_active={current_view === 'settings'} disabled={pending} />
    <main className="appContent" aria-busy={pending}>
      {mutation_error && <div className="requestState" role="alert"><p>{localize_message(mutation_error)}</p><button className="textButton" onClick={() => set_mutation_error('')}>{t("닫기")}</button></div>}
      {(current_view === 'today' || current_view === 'checkin') && <>
        <RequestState loading={today.loading} error={today.error} on_retry={refresh_data} />
        {today.data && (current_view === 'today'
          ? <TodayScreen data={today.data} pending={today_pending} revision={`${revision}:${today_revision}`} on_unauthorized={on_unauthorized} on_action={act_today} on_checkin={() => navigate_to('checkin')} on_open_memory={open_memory_record} on_open_records={() => navigate_to('record')} on_open_workout={() => navigate_to('workout')} on_open_settings={() => navigate_to('settings')} on_refresh={refresh_data} />
          : <CheckinScreen session={today.data.session} workout_date={today.data.workout_date} pending={today_pending} on_back={() => navigate_to('today')} on_open_workout={() => navigate_to('workout')} on_complete={(note) => act_today('manual', note)} on_unauthorized={on_unauthorized} on_photo_complete={(body) => mutate('/sessions/today/photo', 'POST', body, t("사진 인증을 저장했습니다."))} />)}
      </>}
      {current_view === 'record' && <RecordsScreen revision={revision} on_unauthorized={on_unauthorized} initial_tab={record_navigation ? 'list' : 'calendar'} initial_workout_date={record_navigation?.workout_date} focus_record_uuid={record_navigation?.session_uuid} on_open_record={open_workout_record} />}
      {current_view === 'record-detail' && selected_workout_record && <WorkoutRecordScreen record={selected_workout_record} on_back={() => set_current_view('record')} />}
      <WorkoutLogScreen user_uuid={user.user_uuid} initial_workout_date={today.data?.workout_date} is_active={current_view === 'workout'} catalog_revision={exercise_catalog_revision} on_unauthorized={on_unauthorized} on_open_library={() => navigate_to('workout-library')} on_open_checkin={() => navigate_to('checkin')} on_saved={refresh_today} />
      {current_view === 'workout-library' && <WorkoutScreen on_unauthorized={on_unauthorized} on_back={() => navigate_to('workout')} on_catalog_change={refresh_exercise_catalog} />}
      {current_view === 'settings' && <>
        <div className="accountBar"><span>{user.display_name || t("운동 사용자")}{t("님")}</span><button className="quietButton" type="button" disabled={pending} onClick={logout}>{t("전체 기기 로그아웃")}</button></div>
        {(!settings.data || !options.data) && <article className="settingsCard"><LanguageSelector /></article>}
        <RequestState loading={settings.loading || options.loading} error={settings.error || options.error} on_retry={refresh_data} />
        {settings.data && options.data && <SettingsScreen data={settings.data} options={options.data} pending={pending || settings.loading || options.loading} on_save={(body) => mutate('/settings', 'PUT', body, t("설정을 저장했습니다."))} />}
      </>}
    </main>
    <BottomNavigation current_view={current_view === 'record-detail' ? 'record' : current_view} on_navigate={navigate_to} disabled={pending} />
    <Toast message={toast_message} />
  </div>;
}
