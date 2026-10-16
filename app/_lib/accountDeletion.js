import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { WorkoutLocation } from './workoutLocation';

export async function clear_deleted_account_data(user_uuid, { is_current_account = true } = {}) {
  if (!user_uuid) return;
  // Let the deleted account's components unmount before removing their queued local work.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const storage_prefixes = [
    `workout_set_draft:${user_uuid}:`, `workout_timer_snapshot_${user_uuid}`,
    `workout_timer_pending_${user_uuid}`, `workout_arrival_pending_${user_uuid}`,
    `workout_departure_pending_${user_uuid}`,
  ];
  let owns_device = false;
  try {
    owns_device = window.localStorage.getItem('workout_notification_owner_uuid') === user_uuid;
    for (const storage_key of Object.keys(window.localStorage)) {
      if (storage_prefixes.some((prefix) => storage_key.startsWith(prefix))) window.localStorage.removeItem(storage_key);
    }
    if (owns_device || is_current_account) {
      window.localStorage.removeItem('workout_notification_owner_uuid');
      window.localStorage.removeItem('attendance_push_installation_uuid');
    }
  } catch (error) { console.error('[ACCOUNT_LOCAL_CLEANUP_ERROR]', error.name); }
  if (!Capacitor.isNativePlatform() || (!owns_device && !is_current_account)) return;
  let timeout_id;
  try {
    const cleanup_results = await Promise.race([
      Promise.allSettled([
        WorkoutLocation.clearPlace(), PushNotifications.unregister(),
        LocalNotifications.getPending().then(({ notifications }) => notifications.length
          ? LocalNotifications.cancel({ notifications: notifications.map(({ id }) => ({ id })) }) : null),
        Filesystem.readdir({ path: '', directory: Directory.Cache }).then(async ({ files }) => {
          const deletion_results = await Promise.allSettled(files.filter(({ name }) => /^dont-skip-(weekly|monthly)\.(png|txt)$/.test(name))
            .map(({ name }) => Filesystem.deleteFile({ path: name, directory: Directory.Cache })));
          deletion_results.forEach((result) => {
            if (result.status === 'rejected') console.error('[ACCOUNT_SHARE_CACHE_CLEANUP_ERROR]', result.reason?.name || 'Error');
          });
        }),
      ]),
      new Promise((_, reject) => { timeout_id = setTimeout(() => reject(new Error('native_cleanup_timeout')), 12000); }),
    ]);
    cleanup_results.forEach((result) => {
      if (result.status === 'rejected') console.error('[ACCOUNT_NATIVE_CLEANUP_ERROR]', result.reason?.name || 'Error');
    });
  } catch (error) { console.error('[ACCOUNT_NATIVE_CLEANUP_ERROR]', error.message); }
  finally { clearTimeout(timeout_id); }
}
