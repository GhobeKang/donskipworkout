import { useCallback, useEffect, useRef, useState } from 'react';
import { api_request } from '../_lib/api';
import { useLanguage } from './useLanguage';

export default function useMentorshipFeed(path, item_key, on_unauthorized, prepend_pages = false) {
  const { localize_message } = useLanguage();
  const [feed, set_feed] = useState({ path, items: [], next_cursor: null, loading: true, error: '' });
  const request_ref = useRef(null);
  const failures_ref = useRef(0);
  const load = useCallback(async (cursor = null, reset_failures = false) => {
    if (reset_failures) failures_ref.current = 0;
    if (failures_ref.current >= 3) return;
    request_ref.current?.abort();
    const controller = new AbortController();
    request_ref.current = controller;
    set_feed((current) => ({ ...current, path, loading: true, error: '' }));
    try {
      const separator = path.includes('?') ? '&' : '?';
      const result = await api_request(`${path}${cursor ? `${separator}before_id=${cursor}` : ''}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      failures_ref.current = 0;
      set_feed((current) => ({
        path, items: cursor ? (prepend_pages ? [...result[item_key], ...current.items] : [...current.items, ...result[item_key]]) : result[item_key],
        next_cursor: result.next_cursor, loading: false, error: '',
      }));
    } catch (error) {
      if (controller.signal.aborted) return;
      failures_ref.current += 1;
      if (error.status === 401) on_unauthorized();
      set_feed((current) => ({ ...current, loading: false, error: localize_message(error.message),
        ...([403, 404].includes(error.status) ? { items: [], next_cursor: null } : {}),
      }));
    } finally {
      if (request_ref.current === controller) request_ref.current = null;
    }
  }, [path, item_key, on_unauthorized, prepend_pages, localize_message]);
  useEffect(() => {
    failures_ref.current = 0;
    set_feed({ path, items: [], next_cursor: null, loading: true, error: '' });
    load();
    const refresh_notifications = () => load(null, true);
    window.addEventListener('coaching-notifications-updated', refresh_notifications);
    return () => {
      request_ref.current?.abort();
      window.removeEventListener('coaching-notifications-updated', refresh_notifications);
    };
  }, [path, load]);
  return { ...feed, can_retry: failures_ref.current < 3, refresh: () => load(),
    reload_after_save: () => load(null, true), load_more: () => load(feed.next_cursor) };
}
