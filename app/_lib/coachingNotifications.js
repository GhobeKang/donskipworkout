import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { api_request } from './api';
import { translate } from './i18n';

export const coaching_notification_source = 'donskipworkout-coaching-v1';
const owner_storage_key = 'coaching_notification_owner_uuid';
const cursor_storage_prefix = 'coaching_notification_cursor:';
const native_timeout_ms = 5000;
let operation_queue = Promise.resolve();
let pending_open = null;

function serialized(operation) {
  const result = operation_queue.then(operation, operation);
  operation_queue = result.catch(() => {});
  return result;
}

function require_active(signal) {
  if (signal?.aborted) throw new DOMException('Coaching notification sync cancelled', 'AbortError');
}

async function native_operation(operation, signal, on_late_result) {
  let timeout_id;
  let expired = false;
  try {
    return await Promise.race([
      Promise.resolve(operation).then(async (result) => {
        if (expired || signal?.aborted) {
          await on_late_result?.(result);
          throw new DOMException('Coaching notification operation cancelled', 'AbortError');
        }
        return result;
      }),
      new Promise((_, reject) => {
        timeout_id = setTimeout(() => {
          expired = true;
          reject(new Error('코칭 로컬 알림 응답 시간이 초과되었습니다.'));
        }, native_timeout_ms);
      }),
    ]);
  } finally { clearTimeout(timeout_id); }
}

async function remove_notification_items(user_uuid, active_relationship_uuids = null) {
  const should_remove = (notification) => notification.extra?.source === coaching_notification_source
    && (!user_uuid || notification.extra.user_uuid === user_uuid)
    && (!active_relationship_uuids || !active_relationship_uuids.has(notification.extra.relationship_uuid));
  const pending = await native_operation(LocalNotifications.getPending());
  const pending_ids = pending.notifications.filter(should_remove).map(({ id }) => ({ id }));
  if (pending_ids.length) await native_operation(LocalNotifications.cancel({ notifications: pending_ids }));
  const delivered = await native_operation(LocalNotifications.getDeliveredNotifications());
  const delivered_items = delivered.notifications.filter(should_remove);
  if (delivered_items.length) await native_operation(LocalNotifications.removeDeliveredNotifications({ notifications: delivered_items }));
}

export function clear_coaching_notifications(user_uuid) {
  return serialized(async () => {
    try {
      if (Capacitor.isNativePlatform()) await remove_notification_items(user_uuid);
    } finally {
      if (window.localStorage.getItem(owner_storage_key) === user_uuid) window.localStorage.removeItem(owner_storage_key);
      if (pending_open?.user_uuid === user_uuid) pending_open = null;
    }
  });
}

export function request_coaching_notification_permission() {
  if (!Capacitor.isNativePlatform()) return Promise.resolve({ display: 'unsupported' });
  return native_operation(LocalNotifications.requestPermissions());
}

function notification_groups(events, user_uuid, language) {
  const groups = new Map();
  const notification_attempt_uuid = crypto.randomUUID();
  for (const event of events) {
    const group_key = `${event.relationship_uuid}:${event.category}:${event.target === 'own_research' ? `${event.exercise_source}:${event.exercise_id}` : ''}`;
    const previous = groups.get(group_key);
    groups.set(group_key, { event, count: (previous?.count || 0) + 1 });
  }
  return [...groups.values()].map(({ event, count }) => ({
    id: 1000000000 + event.event_id % 1000000000,
    title: translate(event.title, [], language),
    body: count > 1 ? translate('새 코칭 알림 {0}건이 있습니다. 앱에서 확인해 주세요.', [count], language) : translate(event.body, [], language),
    channelId: 'coaching-local',
    threadIdentifier: `coaching:${event.relationship_uuid}`,
    extra: { source: coaching_notification_source, user_uuid,
      notification_attempt_uuid,
      notification_uuid: event.notification_uuid, relationship_uuid: event.relationship_uuid,
      target: event.target, exercise_source: event.exercise_source, exercise_id: event.exercise_id,
      exercise_name: event.exercise_name },
  }));
}

export function sync_coaching_notifications({ user_uuid, language = 'ko', signal }) {
  if (!Capacitor.isNativePlatform()) return Promise.resolve({ permission: 'unsupported', registered_count: 0 });
  return serialized(async () => {
    require_active(signal);
    const previous_owner = window.localStorage.getItem(owner_storage_key);
    if (previous_owner !== user_uuid) await remove_notification_items(null);
    require_active(signal);
    window.localStorage.setItem(owner_storage_key, user_uuid);
    const permission = await native_operation(LocalNotifications.checkPermissions(), signal);
    if (permission.display !== 'granted') return { permission: permission.display, registered_count: 0 };
    if (Capacitor.getPlatform() === 'android') {
      await native_operation(LocalNotifications.createChannel({ id: 'coaching-local',
        name: translate('코칭 알림', [], language), importance: 4, visibility: 0, vibration: true }), signal);
    }
    let cursor = Number(window.localStorage.getItem(cursor_storage_prefix + user_uuid) || 0);
    if (!Number.isSafeInteger(cursor) || cursor < 0) cursor = 0;
    let registered_count = 0;
    let research_changed = false;
    // Bound catch-up work. Remaining pages are picked up on the next sync.
    for (let page_index = 0; page_index < 3; page_index += 1) {
      require_active(signal);
      const result = await api_request(`/mentorship/notifications?after_id=${cursor}`, { signal });
      require_active(signal);
      await remove_notification_items(user_uuid, new Set(result.active_relationship_uuids));
      require_active(signal);
      const notifications = notification_groups(result.notifications, user_uuid, language);
      if (notifications.length) {
        await native_operation(LocalNotifications.schedule({ notifications }), signal, async () => {
          const notification_attempt_uuid = notifications[0].extra.notification_attempt_uuid;
          const belongs_to_attempt = (item) => item.extra?.notification_attempt_uuid === notification_attempt_uuid
            && item.extra?.user_uuid === user_uuid && item.extra?.source === coaching_notification_source;
          const pending = await native_operation(LocalNotifications.getPending());
          const pending_ids = pending.notifications.filter(belongs_to_attempt).map(({ id }) => ({ id }));
          if (pending_ids.length) await native_operation(LocalNotifications.cancel({ notifications: pending_ids }));
          const delivered = await native_operation(LocalNotifications.getDeliveredNotifications());
          const expired_items = delivered.notifications.filter(belongs_to_attempt);
          if (expired_items.length) await native_operation(LocalNotifications.removeDeliveredNotifications({ notifications: expired_items }));
        });
        registered_count += notifications.length;
        research_changed ||= result.notifications.some((item) => item.category === 'mentor_research_edit');
      }
      require_active(signal);
      cursor = result.cursor;
      window.localStorage.setItem(cursor_storage_prefix + user_uuid, String(cursor));
      if (!result.has_more) break;
    }
    return { permission: 'granted', registered_count, research_changed };
  });
}

export function queue_coaching_notification_open(notification) {
  const extra = notification?.extra;
  const uuid_pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (extra?.source !== coaching_notification_source || !uuid_pattern.test(extra.user_uuid || '')
      || !uuid_pattern.test(extra.relationship_uuid || '') || !uuid_pattern.test(extra.notification_uuid || '')
      || !['messages', 'research', 'own_research'].includes(extra.target)) return;
  if (extra.target === 'own_research' && (!['custom', 'shared'].includes(extra.exercise_source)
      || !Number.isSafeInteger(extra.exercise_id) || extra.exercise_id < 1)) return;
  pending_open = { ...extra };
  window.dispatchEvent(new Event('coaching-notification-open'));
}

export function take_coaching_notification_open(user_uuid) {
  const notification = pending_open;
  pending_open = null;
  return notification?.user_uuid === user_uuid ? notification : null;
}
