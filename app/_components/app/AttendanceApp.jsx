'use client';

import { useLanguage } from '../../_hooks/useLanguage';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api_request } from '../../_lib/api';
import AuthScreen from '../screens/AuthScreen';
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
  const [toast_message, set_toast_message] = useState('');
  const auth_controller = useRef(null);
  const expire_session = useCallback(() => {
    set_user(null);
    set_auth_error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    set_toast_message('');
  }, []);

  useEffect(() => () => auth_controller.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    api_request('/auth/session', { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) set_user(result.user);
      })
      .catch((error) => {
        if (!controller.signal.aborted && error.status !== 401) set_auth_error(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) set_auth_loading(false);
      });
    return () => controller.abort();
  }, []);
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
      const result = await api_request(`/auth/${auth_mode}`, { method: 'POST', body: credentials, signal: controller.signal });
      if (!controller.signal.aborted) set_user(result.user);
    } catch (error) {
      if (!controller.signal.aborted) set_auth_error(error.status === 401 ? t("이메일 또는 비밀번호를 확인해 주세요.") : error.message);
    } finally {
      auth_controller.current = null;
      if (!controller.signal.aborted) set_auth_pending(false);
    }
  };
  const finish_logout = (message) => {
    set_user(null);
    set_auth_error('');
    set_toast_message(message);
  };
  if (auth_loading) return <div className="phoneShell">
    <StatusBar />
    <main className="appContent"><p className="infoText">{t("로그인 상태를 확인하는 중…")}</p></main>
  </div>;
  if (user) return <AuthenticatedApp key={user.user_uuid} user={user} on_unauthorized={expire_session} on_logout={finish_logout} />;
  return <div className="phoneShell">
    <StatusBar />
    <main className="appContent"><AuthScreen on_authenticate={authenticate} pending={auth_pending} error={auth_error} on_clear_error={() => set_auth_error('')} /></main>
    <Toast message={toast_message} />
  </div>;
}
