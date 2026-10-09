'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { api_request } from '../_lib/api';
import { pending_arrival_key, WorkoutLocation, workout_arrival_action, workout_arrival_source } from '../_lib/workoutLocation';
import { useLanguage } from './useLanguage';

export default function useWorkoutArrival(user_uuid, on_unauthorized, on_started, on_error) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let disposed = false;
    let processing = false;
    let location_listener;
    let notification_listener;
    const storage_key = pending_arrival_key(user_uuid);

    const process_start = async (request_id) => {
      if (!request_id || processing || disposed) return;
      processing = true;
      try {
        await WorkoutLocation.getStatus({ user_uuid });
        const valid = Capacitor.getPlatform() === 'ios'
          ? (await WorkoutLocation.validateStart({ request_id })).valid
          : (await WorkoutLocation.peekPendingStart()).request_id === request_id;
        if (!valid) {
          localStorage.removeItem(storage_key);
          return;
        }
        const saved_intent = JSON.parse(localStorage.getItem(storage_key) || 'null');
        const attempts = saved_intent?.request_id === request_id ? saved_intent.attempts || 0 : 0;
        if (attempts >= 3) {
          console.error('[WORKOUT_ARRIVAL_START_FAILED] retry limit reached');
          localStorage.removeItem(storage_key);
          if (Capacitor.getPlatform() === 'android') await WorkoutLocation.acknowledgePendingStart({ request_id });
          return;
        }
        localStorage.setItem(storage_key, JSON.stringify({ request_id, attempts: attempts + 1 }));
        try {
          await api_request('/workout-timers', { method: 'POST', body: { request_id } });
        } catch (error) {
          if (error.status !== 409) throw error;
          const current = await api_request('/workout-timers/current');
          if (!['running', 'paused'].includes(current.timer?.status)) throw error;
        }
        if (Capacitor.getPlatform() === 'android') {
          await WorkoutLocation.acknowledgePendingStart({ request_id });
        }
        localStorage.removeItem(storage_key);
        if (!disposed) on_started();
      } catch (error) {
        if (error.status === 401) on_unauthorized();
        else if (!disposed) on_error(error.message || t('운동 타이머를 시작하지 못했습니다.'));
      } finally {
        processing = false;
      }
    };

    const inspect_pending = async () => {
      try {
        const saved_intent = JSON.parse(localStorage.getItem(storage_key) || 'null');
        const native_intent = Capacitor.getPlatform() === 'android'
          ? await WorkoutLocation.peekPendingStart() : null;
        const request_id = native_intent?.request_id || saved_intent?.request_id;
        if (request_id) await process_start(request_id);
      } catch (error) {
        console.error('[WORKOUT_ARRIVAL_PENDING_ERROR]', error.message || 'unknown');
      }
    };

    const handle_notification_action = ({ actionId, notification }) => {
      if (Capacitor.getPlatform() !== 'ios'
        || notification?.extra?.source !== workout_arrival_source
        || !['tap', workout_arrival_action].includes(actionId)) return;
      process_start(notification.extra.request_id);
    };

    const refresh_on_return = () => {
      if (document.visibilityState === 'visible') inspect_pending();
    };
    document.addEventListener('visibilitychange', refresh_on_return);
    window.addEventListener('online', inspect_pending);
    WorkoutLocation.addListener('startRequested', ({ request_id }) => process_start(request_id))
      .then((listener) => {
        if (disposed) listener.remove();
        else location_listener = listener;
      })
      .catch((error) => console.error('[WORKOUT_ARRIVAL_LISTENER_ERROR]', error.message || 'unknown'));
    LocalNotifications.addListener('localNotificationActionPerformed', handle_notification_action)
      .then((listener) => {
        if (disposed) listener.remove();
        else notification_listener = listener;
      })
      .catch((error) => console.error('[WORKOUT_ARRIVAL_NOTIFICATION_ERROR]', error.message || 'unknown'));
    WorkoutLocation.getStatus({ user_uuid }).then(inspect_pending)
      .catch((error) => console.error('[WORKOUT_LOCATION_STATUS_ERROR]', error.message || 'unknown'));

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', refresh_on_return);
      window.removeEventListener('online', inspect_pending);
      location_listener?.remove();
      notification_listener?.remove();
    };
  }, [user_uuid, on_unauthorized, on_started, on_error, t]);
}

