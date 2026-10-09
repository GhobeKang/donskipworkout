'use client';

import { useLanguage } from '../../_hooks/useLanguage';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { api_request } from '../../_lib/api';
import { clear_workout_notifications, prepare_workout_notifications_for_user } from '../../_lib/notifications';
import { get_push_installation_uuid } from '../../_lib/pushNotifications';
import AuthScreen from '../screens/AuthScreen';
import RequestState from '../ui/RequestState';
import StatusBar from '../layout/StatusBar';
import Toast from '../ui/Toast';
import AuthenticatedApp from './AuthenticatedApp';

export default function AttendanceApp() {
  const { t, language } = useLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return <>
    <title>{t('운동 출석 습관 앱')}</title>
    <meta name="description" content={t('운동 출석 습관을 만드는 로컬 우선 앱')} />
    <AttendanceContent />
  </>;
}

function AttendanceContent() {
  const { t } = useLanguage();
  const [user, set_user] = useState(null);
  const [auth_loading, set_auth_loading] = useState(true);
  const [auth_pending, set_auth_pending] = useState(false);
  const [auth_error, set_auth_error] = useState('');
  const [session_restore_error, set_session_restore_error] = useState('');
  const [session_restore_revision, set_session_restore_revision] = useState(0);
  const [toast_message, set_toast_message] = useState('');
  const auth_controller = useRef(null);
  const expire_session = useCallback(() => {
    set_user(null);
    set_auth_error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    set_toast_message('');
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || user) return undefined;
    let listener;
    let disposed = false;
    PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const room_uuid = notification.data?.room_uuid;
      if (!room_uuid) return;
      const next_url = new URL(window.location.href);
      next_url.searchParams.set('room', room_uuid);
      window.history.replaceState({}, '', next_url);
    }).then((registered_listener) => {
      if (disposed) registered_listener.remove();
      else listener = registered_listener;
    }).catch((error) => console.error('[PUSH_ACTION_LISTENER_ERROR]', error.message || 'unknown'));
    return () => {
      disposed = true;
      listener?.remove();
    };
  }, [user]);

  useEffect(() => () => auth_controller.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    set_auth_loading(true);
    set_session_restore_error('');
    api_request('/auth/session', { signal: controller.signal })
      .then(async (result) => {
        try {
          await prepare_workout_notifications_for_user(result.user.user_uuid);
        } catch (error) {
          console.error('[WORKOUT_NOTIFICATION_OWNER_ERROR]', error.message || 'unknown');
        }
        if (!controller.signal.aborted) set_user(result.user);
      })
      .catch((error) => {
        if (!controller.signal.aborted && error.status !== 401) set_session_restore_error(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) set_auth_loading(false);
      });
    return () => controller.abort();
  }, [session_restore_revision]);
  useEffect(() => {
    if (!toast_message) return undefined;
    const toast_timer = setTimeout(() => set_toast_message(''), 6000);
    return () => clearTimeout(toast_timer);
  }, [toast_message]);

  const authenticate = async (auth_mode, credentials) => {
    if (auth_controller.current) return;
    const controller = new AbortController();
    auth_controller.current = controller;
    set_auth_pending(true);
    set_auth_error('');
    try {
      const installation_uuid = get_push_installation_uuid();
      const result = await api_request(`/auth/${auth_mode}`, {
        method: 'POST',
        body: { ...credentials, ...(installation_uuid ? { installation_uuid } : {}) },
        signal: controller.signal,
      });
      try {
        await prepare_workout_notifications_for_user(result.user.user_uuid);
      } catch (error) {
        console.error('[WORKOUT_NOTIFICATION_OWNER_ERROR]', error.message || 'unknown');
      }
      if (!controller.signal.aborted) set_user(result.user);
    } catch (error) {
      if (!controller.signal.aborted) set_auth_error(error.status === 401 ? t("이메일 또는 비밀번호를 확인해 주세요.") : error.message);
    } finally {
      auth_controller.current = null;
      if (!controller.signal.aborted) set_auth_pending(false);
    }
  };
  const finish_logout = async (message) => {
    try {
      await clear_workout_notifications();
    } catch (error) {
      console.error('[WORKOUT_NOTIFICATION_CLEAR_ERROR]', error.message || 'unknown');
    }
    set_user(null);
    set_auth_error('');
    set_toast_message(message);
  };
  if (auth_loading) return <div className="phoneShell">
    <StatusBar />
    <main className="appContent"><p className="infoText">{t("로그인 상태를 확인하는 중…")}</p></main>
  </div>;
  if (user) return <AuthenticatedApp key={user.user_uuid} user={user} on_unauthorized={expire_session} on_logout={finish_logout} />;
  if (session_restore_error) return <div className="phoneShell">
    <StatusBar />
    <main className="appContent"><RequestState error={session_restore_error} on_retry={() => set_session_restore_revision((value) => value + 1)} /></main>
  </div>;
  return <div className="phoneShell">
    <StatusBar />
    <main className="appContent"><AuthScreen on_authenticate={authenticate} pending={auth_pending} error={auth_error} on_clear_error={() => set_auth_error('')} /></main>
    <Toast message={toast_message} />
  </div>;
}
