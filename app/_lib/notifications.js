import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const workout_reminder = registerPlugin('WorkoutReminder');
const notification_source = 'donskipworkout-workout-reminder';
const migration_storage_key = 'workout_notification_delivery_mode';
const owner_storage_key = 'workout_notification_owner_uuid';
let cleanup_promise = null;

async function cancel_legacy_workout_notifications() {
  if (Capacitor.getPlatform() === 'android') await workout_reminder.clear();
  const pending = await LocalNotifications.getPending();
  const notification_ids = pending.notifications
    .filter((notification) => notification.extra?.source === notification_source)
    .map((notification) => notification.id);
  const current_day = Math.floor(Date.now() / 86400000);
  for (let day_offset = -90; day_offset <= 90; day_offset += 1) {
    for (const kind_code of [1, 2, 3, 11, 12, 13]) {
      notification_ids.push((current_day + day_offset) * 100 + kind_code);
    }
  }
  await LocalNotifications.cancel({
    notifications: [...new Set(notification_ids)].map((id) => ({ id })),
  });
  window.localStorage.setItem(migration_storage_key, 'server_push_v1');
}

export async function prepare_workout_notifications_for_user(user_uuid) {
  if (!Capacitor.isNativePlatform()) return;
  if (window.localStorage.getItem(migration_storage_key) !== 'server_push_v1') {
    if (!cleanup_promise) {
      cleanup_promise = (async () => {
        let timeout_id;
        try {
          await Promise.race([
            cancel_legacy_workout_notifications(),
            new Promise((_, reject) => {
              timeout_id = setTimeout(() => reject(new Error('기존 운동 알림을 정리하지 못했습니다. 다시 확인해 주세요.')), 15000);
            }),
          ]);
        } finally { clearTimeout(timeout_id); cleanup_promise = null; }
      })();
    }
    await cleanup_promise;
  }
  if (user_uuid) window.localStorage.setItem(owner_storage_key, user_uuid);
}

export async function clear_workout_notifications() {
  if (Capacitor.isNativePlatform()) await prepare_workout_notifications_for_user();
  window.localStorage.removeItem(owner_storage_key);
}
