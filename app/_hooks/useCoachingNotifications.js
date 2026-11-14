import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  clear_coaching_notifications,
  request_coaching_notification_permission,
  sync_coaching_notifications,
} from '../_lib/coachingNotifications';

export default function useCoachingNotifications({ user_uuid, language, on_unauthorized }) {
  const [status, set_status] = useState({ supported: Capacitor.isNativePlatform(), permission: 'checking', pending: false, error: '' });
  const permission_pending_ref = useRef(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const controller = new AbortController();
    let sync_pending = false;
    let failure_count = 0;
    const sync = async (reset_failures = false) => {
      if (reset_failures) failure_count = 0;
      if (sync_pending || failure_count >= 3 || controller.signal.aborted
          || document.visibilityState !== 'visible' || navigator.onLine === false) return;
      sync_pending = true;
      try {
        const result = await sync_coaching_notifications({ user_uuid, language, signal: controller.signal });
        if (controller.signal.aborted) return;
        failure_count = 0;
        set_status((current) => ({ ...current, permission: result.permission, error: '' }));
        if (result.research_changed) window.dispatchEvent(new Event('coaching-research-updated'));
        if (result.registered_count) window.dispatchEvent(new Event('coaching-notifications-updated'));
      } catch (error) {
        if (controller.signal.aborted) return;
        failure_count += 1;
        console.error('[COACHING_LOCAL_NOTIFICATION_SYNC_ERROR]', error.status || error.name || 'Error');
        if (error.status === 401) on_unauthorized();
        else set_status((current) => ({ ...current, error: error.message || '코칭 알림을 동기화하지 못했습니다.' }));
      } finally { sync_pending = false; }
    };
    const refresh = () => { sync(true); };
    const interval_id = setInterval(() => { sync(); }, 60000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('coaching-notifications-refresh', refresh);
    sync();
    return () => {
      controller.abort();
      clearInterval(interval_id);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('coaching-notifications-refresh', refresh);
    };
  }, [user_uuid, language, on_unauthorized]);
  useEffect(() => () => {
    clear_coaching_notifications(user_uuid).catch((error) => console.error('[COACHING_LOCAL_NOTIFICATION_CLEAR_ERROR]', error.name || 'Error'));
  }, [user_uuid]);
  const request_permission = useCallback(async () => {
    if (permission_pending_ref.current) return;
    permission_pending_ref.current = true;
    set_status((current) => ({ ...current, pending: true, error: '' }));
    try {
      const permission = await request_coaching_notification_permission();
      set_status((current) => ({ ...current, permission: permission.display }));
      if (permission.display === 'granted') window.dispatchEvent(new Event('coaching-notifications-refresh'));
    } catch (error) {
      set_status((current) => ({ ...current, error: error.message || '코칭 알림 권한을 확인하지 못했습니다.' }));
    } finally {
      permission_pending_ref.current = false;
      set_status((current) => ({ ...current, pending: false }));
    }
  }, []);
  return { ...status, request_permission };
}
