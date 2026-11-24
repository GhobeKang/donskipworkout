'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { api_request } from '../_lib/api';
import {
  app_release_key, app_store_url, is_newer_app_release, is_update_snoozed,
  update_snooze_ms, with_update_timeout,
} from '../_lib/appUpdates';

const snooze_storage_key = 'donskipworkout.app-update-snooze';
const check_interval_ms = 15 * 60 * 1000;

export default function useAppUpdate() {
  const [available_update, set_available_update] = useState(null);
  const snoozed_update_ref = useRef(null);

  useEffect(() => {
    const platform = Capacitor.getPlatform();
    if (!Capacitor.isNativePlatform() || !['android', 'ios'].includes(platform)) return undefined;
    let disposed = false;
    let checking = false;
    let last_check_at = 0;
    let app_info = null;
    let app_listener;
    const controller = new AbortController();
    try {
      snoozed_update_ref.current = JSON.parse(localStorage.getItem(snooze_storage_key) || 'null');
    } catch (error) {
      console.warn('[APP_UPDATE_SNOOZE_READ_ERROR]', error.name);
    }

    const check_for_update = async () => {
      if (disposed || checking || document.visibilityState === 'hidden' || navigator.onLine === false) return;
      if (Date.now() - last_check_at < 60000) return;
      checking = true;
      last_check_at = Date.now();
      try {
        app_info ||= await with_update_timeout(App.getInfo());
        if (disposed) return;
        const release = await api_request(`/app-updates/${platform}`, { signal: controller.signal });
        if (disposed) return;
        const store_url = app_store_url(release?.store_url, platform, app_info.id);
        const release_key = release && app_release_key(platform, release);
        if (!store_url || !is_newer_app_release(release, app_info)
          || is_update_snoozed(snoozed_update_ref.current, release_key)) {
          set_available_update(null);
          return;
        }
        set_available_update({ ...release, store_url, release_key, platform, app_info });
      } catch (error) {
        if (!disposed) console.warn('[APP_UPDATE_CHECK_ERROR]', error.status || error.name);
      } finally {
        checking = false;
      }
    };

    check_for_update();
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) check_for_update();
    }).then((listener) => {
      if (disposed) listener.remove().catch(() => {});
      else app_listener = listener;
    }).catch((error) => console.warn('[APP_UPDATE_LISTENER_ERROR]', error.name));
    document.addEventListener('visibilitychange', check_for_update);
    window.addEventListener('online', check_for_update);
    const check_timer = setInterval(check_for_update, check_interval_ms);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(check_timer);
      document.removeEventListener('visibilitychange', check_for_update);
      window.removeEventListener('online', check_for_update);
      app_listener?.remove().catch(() => {});
    };
  }, []);

  const dismiss_update = useCallback(() => {
    if (!available_update) return;
    const snoozed_update = { release_key: available_update.release_key, until: Date.now() + update_snooze_ms };
    snoozed_update_ref.current = snoozed_update;
    try {
      localStorage.setItem(snooze_storage_key, JSON.stringify(snoozed_update));
    } catch (error) {
      console.warn('[APP_UPDATE_SNOOZE_WRITE_ERROR]', error.name);
    }
    set_available_update(null);
  }, [available_update]);

  return { available_update, dismiss_update };
}
