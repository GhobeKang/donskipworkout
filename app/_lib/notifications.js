import { translate as t } from './i18n';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const notification_source = 'donskipworkout-workout-reminder';
const notification_channel_id = 'workout-reminders';
const notification_horizon_days = 30;
const notification_cancel_horizon_days = 90;
const workout_reminder_lead_minutes = 30;
const missed_reminder_delay_minutes = 30;
const missed_reminder_repeat_count = 3;
const missed_reminder_interval_minutes = 30;
const notification_kind_codes = {
  workout: 1,
  free_workout: 3,
  snooze: 2,
  missed_1: 11,
  missed_2: 12,
  missed_3: 13,
};
const closed_session_statuses = new Set(['completed', 'rest', 'missed']);

function parse_workout_date(workout_date) {
  const [year, month, day] = workout_date.split('-').map(Number);
  if ([year, month, day].some(Number.isNaN)) return null;
  return { year, month, day };
}

function add_calendar_days(workout_date, day_count) {
  const date_parts = parse_workout_date(workout_date);
  if (!date_parts) return null;
  const date_value = new Date(Date.UTC(date_parts.year, date_parts.month - 1, date_parts.day + day_count));
  return [date_value.getUTCFullYear(), String(date_value.getUTCMonth() + 1).padStart(2, '0'), String(date_value.getUTCDate()).padStart(2, '0')].join('-');
}

function get_date_parts_in_time_zone(date_value, time_zone) {
  const date_parts = new Intl.DateTimeFormat('en-US', {
    timeZone: time_zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date_value);
  return Object.fromEntries(date_parts.map(({ type, value }) => [type, Number(value)]));
}

function get_time_zone_offset_milliseconds(date_value, time_zone) {
  const parts = get_date_parts_in_time_zone(date_value, time_zone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date_value.getTime();
}

function create_scheduled_date(workout_date, workout_time, time_zone, offset_minutes = 0) {
  const date_parts = parse_workout_date(workout_date);
  const time_parts = workout_time?.split(':').map(Number);
  if (!date_parts || !time_parts || time_parts.length < 2 || time_parts.some(Number.isNaN)) return null;
  const wall_clock_value = Date.UTC(date_parts.year, date_parts.month - 1, date_parts.day, time_parts[0], time_parts[1]);
  let timestamp = wall_clock_value;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    timestamp = wall_clock_value - get_time_zone_offset_milliseconds(new Date(timestamp), time_zone);
  }
  const scheduled_date = new Date(timestamp);
  return new Date(scheduled_date.getTime() + offset_minutes * 60000);
}

function get_notification_id(workout_date, notification_kind) {
  const date_parts = parse_workout_date(workout_date);
  if (!date_parts) return null;
  const day_number = Math.floor(Date.UTC(date_parts.year, date_parts.month - 1, date_parts.day) / 86400000);
  return day_number * 100 + notification_kind_codes[notification_kind];
}

function get_notification_ids(workout_date) {
  return ['workout', 'free_workout', 'snooze', 'missed_1', 'missed_2', 'missed_3']
    .map((notification_kind) => get_notification_id(workout_date, notification_kind));
}

function get_current_workout_date() {
  const date_parts = get_date_parts_in_time_zone(new Date(), 'Asia/Seoul');
  return `${date_parts.year}-${String(date_parts.month).padStart(2, '0')}-${String(date_parts.day).padStart(2, '0')}`;
}

function is_scheduled_session(session_status) {
  return !session_status || !closed_session_statuses.has(session_status);
}

function has_enabled_notifications(settings) {
  return Boolean(settings.notification_workout_enabled
    || settings.notification_free_workout_enabled
    || settings.notification_missed_enabled
    || settings.notification_snooze_enabled);
}

function create_notification({ workout_date, notification_kind, at, title, body }) {
  const notification_id = get_notification_id(workout_date, notification_kind);
  if (!notification_id || !at || at.getTime() <= Date.now() + 5000) return null;
  return {
    id: notification_id,
    title,
    body,
    channelId: notification_channel_id,
    extra: { source: notification_source, workout_date, notification_kind },
    schedule: { at, allowWhileIdle: true },
  };
}

function get_notification_content(notification_catalog, notification_kind, roast_level, workout_time) {
  const default_content = notification_catalog.defaults[notification_kind];
  const roast_messages = notification_kind === 'free_workout'
    ? []
    : notification_catalog.messages_by_roast_level?.[roast_level] || [];
  const message_body = roast_messages.length
    ? roast_messages[Math.floor(Math.random() * roast_messages.length)]
    : default_content.body;
  return {
    title: t(default_content.title).replaceAll('{workout_time}', workout_time),
    body: t(message_body).replaceAll('{workout_time}', workout_time),
  };
}

function build_notifications(settings, today_data, notification_catalog) {
  const time_zone = today_data.timezone || 'Asia/Seoul';
  const notifications = [];
  const today_date = today_data.workout_date;
  const schedule_days = new Set(settings.schedule_days);

  for (let day_offset = 0; day_offset <= notification_horizon_days; day_offset += 1) {
    const workout_date = add_calendar_days(today_date, day_offset);
    const date_parts = parse_workout_date(workout_date);
    if (!workout_date || !date_parts) continue;

    const is_today = workout_date === today_date;
    const current_session = is_today ? today_data.session : null;
    const session_status = current_session?.session_status;
    const is_active_session = is_scheduled_session(session_status);
    const workout_time = current_session?.scheduled_time || settings.workout_time;
    const is_snoozed_session = is_today && current_session?.snooze_count > 0 && session_status === 'scheduled';
    const is_scheduled_day = schedule_days.has(new Date(Date.UTC(date_parts.year, date_parts.month - 1, date_parts.day)).getUTCDay());

    if (!is_scheduled_day) {
      if (settings.notification_free_workout_enabled && !current_session) {
        notifications.push(create_notification({
          workout_date,
          notification_kind: 'free_workout',
          at: create_scheduled_date(workout_date, settings.workout_time, time_zone),
          ...get_notification_content(notification_catalog, 'free_workout', settings.roast_level, settings.workout_time),
        }));
      }
      continue;
    }

    if (is_active_session && is_snoozed_session && settings.notification_snooze_enabled) {
      notifications.push(create_notification({
        workout_date,
        notification_kind: 'snooze',
        at: create_scheduled_date(workout_date, workout_time, time_zone),
        ...get_notification_content(notification_catalog, 'snooze', settings.roast_level, workout_time),
      }));
    } else if (is_active_session && settings.notification_workout_enabled) {
      notifications.push(create_notification({
        workout_date,
        notification_kind: 'workout',
        at: create_scheduled_date(workout_date, workout_time, time_zone, -workout_reminder_lead_minutes),
        ...get_notification_content(notification_catalog, 'workout', settings.roast_level, workout_time),
      }));
    }

    if (is_active_session && settings.notification_missed_enabled) {
      for (let reminder_number = 1; reminder_number <= missed_reminder_repeat_count; reminder_number += 1) {
        notifications.push(create_notification({
          workout_date,
          notification_kind: `missed_${reminder_number}`,
          at: create_scheduled_date(
            workout_date,
            workout_time,
            time_zone,
            missed_reminder_delay_minutes + (reminder_number - 1) * missed_reminder_interval_minutes,
          ),
          ...get_notification_content(notification_catalog, 'missed', settings.roast_level, workout_time),
        }));
      }
    }
  }

  return notifications.filter(Boolean);
}

async function cancel_scheduled_notifications() {
  const notification_ids = [];
  for (let day_offset = 0; day_offset <= notification_cancel_horizon_days; day_offset += 1) {
    const workout_date = add_calendar_days(get_current_workout_date(), day_offset);
    if (workout_date) notification_ids.push(...get_notification_ids(workout_date));
  }
  let pending_notifications = { notifications: [] };
  try {
    pending_notifications = await LocalNotifications.getPending();
  } catch (_) {
    // Deterministic IDs still cover the regular scheduling horizon when pending lookup is unavailable.
  }
  const tracked_ids = pending_notifications.notifications
    .filter((notification) => notification.extra?.source === notification_source)
    .map((notification) => notification.id);
  const ids_to_cancel = [...new Set([...notification_ids, ...tracked_ids])];
  if (ids_to_cancel.length) await LocalNotifications.cancel({ notifications: ids_to_cancel.map((id) => ({ id })) });
}

async function ensure_notification_permission() {
  const permission_status = await LocalNotifications.checkPermissions();
  if (permission_status.display === 'granted') return permission_status;
  if (permission_status.display === 'denied') return permission_status;
  return LocalNotifications.requestPermissions();
}

async function prepare_notification_channel() {
  if (Capacitor.getPlatform() !== 'android') return;
  await LocalNotifications.createChannel({
    id: notification_channel_id,
    name: t("운동 알림"),
    description: t("운동 일정과 자유운동 권유 및 미루기 알림"),
    importance: 3,
    visibility: 0,
    vibration: true,
  });
}

export async function sync_workout_notifications({ settings, today_data, notification_catalog }) {
  if (!Capacitor.isNativePlatform()) return { supported: false, scheduled_count: 0 };

  if (!settings || !today_data || !Array.isArray(settings.schedule_days) || !has_enabled_notifications(settings)) {
    await cancel_scheduled_notifications();
    return { supported: true, scheduled_count: 0 };
  }

  // Keep existing device reminders when remote copy is not available yet.
  if (!notification_catalog) return { supported: true, skipped: true };
  const notifications = build_notifications(settings, today_data, notification_catalog);
  const permission_status = await ensure_notification_permission();
  if (permission_status.display !== 'granted') return { supported: true, permission: permission_status.display, scheduled_count: 0 };

  await prepare_notification_channel();
  await cancel_scheduled_notifications();
  if (notifications.length) await LocalNotifications.schedule({ notifications });
  return { supported: true, permission: permission_status.display, scheduled_count: notifications.length };
}

export async function clear_workout_notifications() {
  if (Capacitor.isNativePlatform()) await cancel_scheduled_notifications();
}
