import { useLanguage } from '../../_hooks/useLanguage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import useApiResource from '../../_hooks/useApiResource';
import { api_request } from '../../_lib/api';
import { open_exact_alarm_settings, sync_workout_notifications } from '../../_lib/notifications';
import { refresh_push_registration } from '../../_lib/pushNotifications';
import { WorkoutLocation } from '../../_lib/workoutLocation';
import useWorkoutArrival from '../../_hooks/useWorkoutArrival';
import bundled_notification_catalog from '../../../server/notification-config/catalog.json';
import BottomNavigation from '../layout/BottomNavigation';
import StatusBar from '../layout/StatusBar';
import CheckinScreen from '../screens/CheckinScreen';
import RecordsScreen from '../screens/RecordsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import TodayScreen from '../screens/TodayScreen';
import WorkoutLogScreen from '../screens/WorkoutLogScreen';
import WorkoutRecordScreen from '../screens/WorkoutRecordScreen';
import WorkoutScreen from '../screens/WorkoutScreen';
import ChallengeScreen from '../challenge/ChallengeScreen';
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
  const [exact_alarm_status, set_exact_alarm_status] = useState(null);
  const [exact_alarm_settings_pending, set_exact_alarm_settings_pending] = useState(false);
  const mutation_controller = useRef(null);
  const notification_sync_id = useRef(0);
  const notification_sync_queue = useRef(Promise.resolve());
  const last_notification_permission = useRef(null);
  const today = useApiResource('/today', `${revision}:${today_revision}`, on_unauthorized);
  const settings = useApiResource('/settings', revision, on_unauthorized);
  const options = useApiResource('/settings/options', revision, on_unauthorized);
  const notification_catalog = useApiResource('/notifications/catalog', revision, on_unauthorized);
  const refresh_data = () => set_revision((value) => value + 1);
  const refresh_today = () => set_today_revision((value) => value + 1);
  const refresh_exercise_catalog = () => set_exercise_catalog_revision((value) => value + 1);
  const handle_arrival_started = useCallback(() => {
    set_current_view('today');
    set_today_revision((value) => value + 1);
    window.dispatchEvent(new Event('workout-timer-changed'));
    set_toast_message(t('운동 타이머를 시작했습니다.'));
  }, [t]);
  const handle_arrival_error = useCallback((message) => set_toast_message(message), []);
  useWorkoutArrival(user.user_uuid, on_unauthorized, handle_arrival_started, handle_arrival_error);
  useEffect(() => {
    const search_params = new URLSearchParams(window.location.search);
    if (search_params.has('invite') || search_params.has('room')) set_current_view('challenge');
  }, []);
  useEffect(() => {
    refresh_push_registration().catch((error) => {
      console.error('[PUSH_REGISTRATION_ERROR]', error.message || 'unknown');
    });
  }, [user.user_uuid]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let listener;
    let disposed = false;
    PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const room_uuid = notification.data?.room_uuid;
      if (!room_uuid) return;
      const next_url = new URL(window.location.href);
      next_url.searchParams.set('room', room_uuid);
      window.history.replaceState({}, '', next_url);
      set_current_view('challenge');
    }).then((registered_listener) => {
      if (disposed) registered_listener.remove();
      else listener = registered_listener;
    }).catch((error) => console.error('[PUSH_ACTION_LISTENER_ERROR]', error.message || 'unknown'));
    return () => {
      disposed = true;
      listener?.remove();
    };
  }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [current_view]);
  useEffect(() => () => mutation_controller.current?.abort(), []);
  useEffect(() => {
    const refresh_on_resume = () => {
      if (document.visibilityState !== 'visible') return;
      set_revision((value) => value + 1);
      refresh_push_registration().catch((error) => {
        console.error('[PUSH_REGISTRATION_ERROR]', error.message || 'unknown');
      });
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
          user_uuid: user.user_uuid,
          settings: settings.data,
          today_data: today.data,
          notification_catalog: notification_catalog.data || bundled_notification_catalog,
          notification_catalog_source: notification_catalog.data ? 'remote' : 'bundled',
        });
      });
    notification_sync_queue.current = sync_promise;
    sync_promise
      .then((result) => {
        if (cancelled || current_sync_id !== notification_sync_id.current) return;
        set_exact_alarm_status(result.exact_alarm || null);
        if (result.permission === 'granted' && last_notification_permission.current !== 'granted') {
          refresh_push_registration().catch((error) => {
            console.error('[PUSH_REGISTRATION_ERROR]', error.message || 'unknown');
          });
        }
        if (result.permission) last_notification_permission.current = result.permission;
        if (result.permission === 'denied') {
          set_toast_message(t("알림 권한이 꺼져 있어 기기 알림을 예약하지 못했습니다."));
        }
      })
      .catch((error) => {
        if (!cancelled && current_sync_id === notification_sync_id.current) set_toast_message(error.message || t("기기 알림을 예약하지 못했습니다."));
      });
    return () => { cancelled = true; };
  }, [settings.data, today.data, notification_catalog.data, language, user.user_uuid]);
  const open_exact_alarm_permission = async () => {
    set_exact_alarm_settings_pending(true);
    try {
      await open_exact_alarm_settings();
      refresh_data();
    } catch (error) {
      set_toast_message(error.message || t('정확한 알람 설정을 열지 못했습니다.'));
    } finally {
      set_exact_alarm_settings_pending(false);
    }
  };
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
      if (Capacitor.isNativePlatform()) WorkoutLocation.clearPlace().catch((error) => console.error('[WORKOUT_LOCATION_CLEAR_ERROR]', error));
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
      {exact_alarm_status === 'denied' && <div className="requestState" role="status">
        <p>{t('정확한 알람 권한이 꺼져 있어 앱을 닫으면 운동 알림이 늦게 도착할 수 있습니다. 기기 설정에서 정확한 알람을 허용해 주세요.')}</p>
        <button className="textButton" type="button" disabled={exact_alarm_settings_pending} onClick={open_exact_alarm_permission}>{t('정확한 알람 허용하기')}</button>
      </div>}
      {mutation_error && <div className="requestState" role="alert"><p>{localize_message(mutation_error)}</p><button className="textButton" onClick={() => set_mutation_error('')}>{t("닫기")}</button></div>}
      {(current_view === 'today' || current_view === 'checkin') && <>
        <RequestState loading={today.loading} error={today.error} on_retry={refresh_data} />
        {today.data && (current_view === 'today'
          ? <TodayScreen user_uuid={user.user_uuid} data={today.data} pending={today_pending} revision={`${revision}:${today_revision}`} on_unauthorized={on_unauthorized} on_action={act_today} on_checkin={() => navigate_to('checkin')} on_open_memory={open_memory_record} on_open_records={() => navigate_to('record')} on_open_workout={() => navigate_to('workout')} on_open_settings={() => navigate_to('settings')} on_open_challenges={() => navigate_to('challenge')} on_refresh={refresh_data} />
          : <CheckinScreen session={today.data.session} workout_date={today.data.workout_date} pending={today_pending} on_back={() => navigate_to('today')} on_open_workout={() => navigate_to('workout')} on_complete={(note) => act_today('manual', note)} on_unauthorized={on_unauthorized} on_photo_complete={(body) => mutate('/sessions/today/photo', 'POST', body, t("사진 인증을 저장했습니다."))} />)}
      </>}
      {current_view === 'record' && <RecordsScreen revision={revision} on_unauthorized={on_unauthorized} initial_tab={record_navigation ? 'list' : 'calendar'} initial_workout_date={record_navigation?.workout_date} focus_record_uuid={record_navigation?.session_uuid} on_open_record={open_workout_record} timezone={settings.data?.timezone || today.data?.timezone} />}
      {current_view === 'record-detail' && selected_workout_record && <WorkoutRecordScreen record={selected_workout_record} on_back={() => set_current_view('record')} />}
      <WorkoutLogScreen user_uuid={user.user_uuid} initial_workout_date={today.data?.workout_date} is_active={current_view === 'workout'} catalog_revision={exercise_catalog_revision} on_unauthorized={on_unauthorized} on_open_library={() => navigate_to('workout-library')} on_open_checkin={() => navigate_to('checkin')} on_saved={refresh_today} timezone={settings.data?.timezone || today.data?.timezone} />
      {current_view === 'workout-library' && <WorkoutScreen on_unauthorized={on_unauthorized} on_back={() => navigate_to('workout')} on_catalog_change={refresh_exercise_catalog} />}
      {current_view === 'challenge' && <ChallengeScreen user_uuid={user.user_uuid} is_active={current_view === 'challenge'} on_unauthorized={on_unauthorized} on_back={() => navigate_to('today')} />}
      {current_view === 'settings' && <>
        <div className="accountBar"><span>{user.display_name || t("운동 사용자")}{t("님")}</span><button className="quietButton" type="button" disabled={pending} onClick={logout}>{t("전체 기기 로그아웃")}</button></div>
        {(!settings.data || !options.data) && <article className="settingsCard"><LanguageSelector /></article>}
        <RequestState loading={settings.loading || options.loading} error={settings.error || options.error} on_retry={refresh_data} />
        {settings.data && options.data && <SettingsScreen user_uuid={user.user_uuid} data={settings.data} options={options.data} pending={pending || settings.loading || options.loading} on_save={(body) => mutate('/settings', 'PUT', body, t("설정을 저장했습니다."))} on_notify={set_toast_message} />}
      </>}
    </main>
    <BottomNavigation current_view={current_view === 'record-detail' ? 'record' : current_view} on_navigate={navigate_to} disabled={pending} />
    <Toast message={toast_message} />
  </div>;
}
