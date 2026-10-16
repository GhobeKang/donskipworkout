'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { api_request } from '../_lib/api';
import {
  apply_pending_departure,
  is_outside_workout_place,
  location_request,
  pending_departure_key,
  WorkoutLocation,
} from '../_lib/workoutLocation';
import { useLanguage } from './useLanguage';

export default function useWorkoutDeparture(user_uuid, on_unauthorized, on_notify) {
  const { t, localize_message } = useLanguage();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let disposed = false;
    let checking = false;
    let refresh_queued = false;
    let timer_generation = 0;
    let current_timer = null;
    let server_clock_offset = 0;
    let reported_retry_limit = '';
    const storage_key = `workout_timer_snapshot_${user_uuid}`;
    const departure_key = pending_departure_key(user_uuid);
    try { current_timer = JSON.parse(localStorage.getItem(storage_key) || 'null'); }
    catch { /* The server will supply the current timer. */ }

    const publish_timer = (next_timer) => {
      if (disposed) return;
      current_timer = next_timer;
      if (next_timer) localStorage.setItem(storage_key, JSON.stringify(next_timer));
      else localStorage.removeItem(storage_key);
      window.dispatchEvent(new CustomEvent('workout-timer-synced', { detail: next_timer }));
    };

    const bind_timer = async () => {
      const active_timer = ['running', 'paused'].includes(current_timer?.status) ? current_timer : null;
      await location_request(WorkoutLocation.setActiveTimer({
        user_uuid,
        timer_uuid: active_timer?.timer_uuid || '',
        expected_revision: active_timer?.revision || 0,
        server_clock_offset,
      }));
    };

    const process_exit = async (native_exit) => {
      if (!native_exit.request_id || disposed) return false;
      const saved_departure = JSON.parse(localStorage.getItem(departure_key) || 'null');
      const departure = saved_departure?.request_id === native_exit.request_id ? saved_departure : {
        request_id: native_exit.request_id,
        timer_uuid: native_exit.timer_uuid,
        expected_revision: native_exit.expected_revision,
        client_action_at: new Date(native_exit.exited_at + (native_exit.server_clock_offset || 0)).toISOString(),
        attempts: 0,
      };
      localStorage.setItem(departure_key, JSON.stringify(departure));
      const finished_timer = apply_pending_departure(current_timer, departure);
      if (finished_timer !== current_timer) {
        publish_timer(finished_timer);
        on_notify(t('등록한 운동 장소를 벗어나 운동을 종료했습니다.'));
      }
      if (!navigator.onLine) return true;
      if (departure.attempts >= 3) {
        if (reported_retry_limit !== departure.request_id) {
          reported_retry_limit = departure.request_id;
          console.error('[WORKOUT_DEPARTURE_RETRY_LIMIT]', departure.request_id);
        }
        return true;
      }
      departure.attempts += 1;
      localStorage.setItem(departure_key, JSON.stringify(departure));
      try {
        const { timer_uuid, request_id, expected_revision, client_action_at } = departure;
        const result = await api_request(`/workout-timers/${timer_uuid}/location-exit`, {
          method: 'POST', body: { request_id, expected_revision, client_action_at },
        });
        if (disposed) return true;
        await location_request(WorkoutLocation.acknowledgePendingExit({ request_id: departure.request_id }));
        if (disposed) return true;
        localStorage.removeItem(departure_key);
        publish_timer(result);
        await bind_timer();
      } catch (error) {
        console.error('[WORKOUT_DEPARTURE_SYNC_ERROR]', error.message || 'unknown');
        if (error.status === 401) on_unauthorized();
        else if (!disposed) on_notify(localize_message(t('운동은 기기에서 종료됐습니다. 기록 저장을 위해 서버 동기화가 필요합니다.')));
      }
      return true;
    };

    const refresh = async (read_server = true) => {
      if (disposed) return;
      if (checking) { refresh_queued = true; return; }
      checking = true;
      try {
        const place = await location_request(WorkoutLocation.getStatus({ user_uuid }));
        if (disposed) return;
        const native_exit = await location_request(WorkoutLocation.peekPendingExit());
        if (disposed || await process_exit(native_exit)) return;
        if (!place.registered) return;
        if (read_server && navigator.onLine) {
          const request_generation = timer_generation;
          const { timer, server_now } = await api_request('/workout-timers/current');
          if (disposed || request_generation !== timer_generation) return;
          if (timer && timer.timer_uuid === current_timer?.timer_uuid
            && timer.revision < current_timer.revision) return;
          server_clock_offset = Date.parse(server_now) - Date.now();
          publish_timer(timer);
        }
        if (disposed) return;
        await bind_timer();
        if (disposed || !['running', 'paused'].includes(current_timer?.status)
          || document.visibilityState !== 'visible') return;
        const request_generation = timer_generation;
        const position = await location_request(WorkoutLocation.getCurrentPosition());
        if (disposed || request_generation !== timer_generation
          || !is_outside_workout_place(place, position)) return;
        const exit = await location_request(WorkoutLocation.recordExit());
        if (!disposed) await process_exit(exit);
      } catch (error) {
        console.error('[WORKOUT_DEPARTURE_CHECK_ERROR]', error.message || 'unknown');
        if (error.status === 401) on_unauthorized();
      } finally {
        checking = false;
        if (refresh_queued && !disposed) {
          refresh_queued = false;
          refresh();
        }
      }
    };

    const handle_timer_updated = ({ detail }) => {
      current_timer = detail;
      timer_generation += 1;
      if (detail?.server_now) server_clock_offset = Date.parse(detail.server_now) - Date.now();
      // Bind immediately after starting/resuming, before a user can background the app.
      bind_timer().catch((error) => console.error('[WORKOUT_DEPARTURE_BIND_ERROR]', error.message));
      refresh(false);
    };
    const refresh_on_return = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const handle_timer_changed = () => refresh();
    const handle_place_changed = () => {
      bind_timer().catch((error) => console.error('[WORKOUT_DEPARTURE_BIND_ERROR]', error.message));
      refresh(false);
    };
    const retry_sync = () => {
      try {
        const departure = JSON.parse(localStorage.getItem(departure_key) || 'null');
        if (departure) localStorage.setItem(departure_key, JSON.stringify({ ...departure, attempts: 0 }));
        reported_retry_limit = '';
        refresh();
      } catch (error) { console.error('[WORKOUT_DEPARTURE_RETRY_ERROR]', error.message); }
    };
    window.addEventListener('workout-timer-updated', handle_timer_updated);
    window.addEventListener('workout-timer-changed', handle_timer_changed);
    window.addEventListener('workout-place-changed', handle_place_changed);
    window.addEventListener('online', handle_timer_changed);
    window.addEventListener('workout-location-retry', retry_sync);
    document.addEventListener('visibilitychange', refresh_on_return);
    const check_interval = setInterval(refresh_on_return, 30000);
    refresh();
    return () => {
      disposed = true;
      clearInterval(check_interval);
      window.removeEventListener('workout-timer-updated', handle_timer_updated);
      window.removeEventListener('workout-timer-changed', handle_timer_changed);
      window.removeEventListener('workout-place-changed', handle_place_changed);
      window.removeEventListener('online', handle_timer_changed);
      window.removeEventListener('workout-location-retry', retry_sync);
      document.removeEventListener('visibilitychange', refresh_on_return);
    };
  }, [user_uuid, on_unauthorized, on_notify, t, localize_message]);
}
