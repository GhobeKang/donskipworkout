import { useCallback, useEffect, useRef, useState } from 'react';
import { api_request } from '../_lib/api';

export default function useNotificationInbox({ user_uuid, is_open, on_unauthorized }) {
  const [inbox, set_inbox] = useState({ notifications: [], unread_count: 0, next_cursor: null });
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState('');
  const [failure_count, set_failure_count] = useState(0);
  const [reading_uuid, set_reading_uuid] = useState('');
  const request_ref = useRef(null);
  const read_request_ref = useRef(null);
  const failure_count_ref = useRef(0);

  useEffect(() => {
    set_inbox({ notifications: [], unread_count: 0, next_cursor: null });
    set_reading_uuid('');
    failure_count_ref.current = 0;
    set_failure_count(0);
    return () => { read_request_ref.current?.abort(); };
  }, [user_uuid]);

  const load = useCallback(async (before_id = null) => {
    if (failure_count_ref.current >= 3) return;
    if (before_id && request_ref.current) return;
    request_ref.current?.abort();
    const controller = new AbortController();
    request_ref.current = controller;
    set_loading(true);
    set_error('');
    try {
      const result = await api_request(`/notifications/inbox?scope=all&limit=30${before_id ? `&before_id=${before_id}` : ''}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      set_inbox((current) => ({ ...result, notifications: before_id
        ? [...current.notifications, ...result.notifications.filter((item) => !current.notifications.some((previous) => previous.notification_uuid === item.notification_uuid))]
        : result.notifications }));
      failure_count_ref.current = 0;
      set_failure_count(0);
    } catch (request_error) {
      if (controller.signal.aborted) return;
      failure_count_ref.current += 1;
      set_failure_count(failure_count_ref.current);
      if (request_error.status === 401) on_unauthorized();
      else set_error(request_error.message);
    } finally {
      if (request_ref.current === controller) {
        request_ref.current = null;
        if (!controller.signal.aborted) set_loading(false);
      }
    }
  }, [on_unauthorized]);

  useEffect(() => {
    if (is_open) { failure_count_ref.current = 0; set_failure_count(0); }
    const refresh = () => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) load();
    };
    const reconnect = () => { failure_count_ref.current = 0; set_failure_count(0); refresh(); };
    const interval_id = setInterval(() => { if (!is_open) refresh(); }, 60000);
    window.addEventListener('notification-inbox-changed', refresh);
    window.addEventListener('coaching-notifications-updated', refresh);
    window.addEventListener('online', reconnect);
    document.addEventListener('visibilitychange', refresh);
    refresh();
    return () => {
      clearInterval(interval_id);
      request_ref.current?.abort();
      window.removeEventListener('notification-inbox-changed', refresh);
      window.removeEventListener('coaching-notifications-updated', refresh);
      window.removeEventListener('online', reconnect);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load, is_open, user_uuid]);

  const mark_read = async (notification) => {
    if (read_request_ref.current) return false;
    if (notification.read_at) return true;
    const controller = new AbortController();
    read_request_ref.current = controller;
    set_reading_uuid(notification.notification_uuid);
    set_error('');
    try {
      await api_request(`/notifications/inbox/${notification.notification_uuid}/read`, { method: 'PUT', body: {}, signal: controller.signal });
      if (controller.signal.aborted) return false;
      // A response fetched before this read must not restore its unread state.
      request_ref.current?.abort();
      request_ref.current = null;
      set_loading(false);
      set_inbox((current) => ({ ...current, unread_count: Math.max(0, current.unread_count - 1),
        notifications: current.notifications.map((item) => item.notification_uuid === notification.notification_uuid
          ? { ...item, read_at: new Date().toISOString() } : item) }));
      window.dispatchEvent(new Event('coaching-notifications-refresh'));
      return true;
    } catch (request_error) {
      if (controller.signal.aborted) return false;
      if (request_error.status === 401) on_unauthorized();
      else set_error(request_error.message);
      return false;
    } finally {
      if (read_request_ref.current === controller) {
        read_request_ref.current = null;
        if (!controller.signal.aborted) set_reading_uuid('');
      }
    }
  };

  return { ...inbox, loading, error, reading_uuid, can_retry: failure_count < 3,
    refresh: () => load(), load_more: () => inbox.next_cursor && load(inbox.next_cursor), mark_read };
}
