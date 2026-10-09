import { translate as t } from './i18n';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const workout_reminder = registerPlugin('WorkoutReminder');

const notification_source = 'donskipworkout-workout-reminder';
const notification_owner_storage_key = 'workout_notification_owner_uuid';
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
let last_workout_notification_sync = { status: 'not_run' };

function record_workout_notification_sync(status, details = {}) {
  last_workout_notification_sync = {
    status,
    checked_at: new Date().toISOString(),
    ...details,
  };
  return last_workout_notification_sync;
}

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
  const possible_offsets = new Set([-36, 0, 36].map((hours) =>
    get_time_zone_offset_milliseconds(new Date(wall_clock_value + hours * 3600000), time_zone)));
  const candidates = [...possible_offsets].map((offset) => {
    const timestamp = wall_clock_value - offset;
    const local_parts = get_date_parts_in_time_zone(new Date(timestamp), time_zone);
    const local_value = Date.UTC(local_parts.year, local_parts.month - 1, local_parts.day, local_parts.hour, local_parts.minute);
    return { timestamp, difference: local_value - wall_clock_value };
  });
  const matching_candidate = candidates.filter(({ difference }) => difference === 0)
    .sort((first, second) => first.timestamp - second.timestamp)[0];
  const next_candidate = candidates.filter(({ difference }) => difference > 0)
    .sort((first, second) => first.difference - second.difference)[0];
  const scheduled_date = new Date((matching_candidate || next_candidate || candidates[0]).timestamp);
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

function get_current_workout_date(time_zone = 'Asia/Seoul') {
  const date_parts = get_date_parts_in_time_zone(new Date(), time_zone);
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
    extra: { source: notification_source, workout_date, notification_kind, scheduled_at: at.toISOString() },
    schedule: { at, allowWhileIdle: true },
  };
}

function get_notification_content(notification_catalog, notification_kind, roast_level, workout_time, workout_date, message_variant = notification_kind) {
  const default_content = notification_catalog.defaults[notification_kind];
  const roast_messages = notification_kind === 'free_workout'
    ? []
    : notification_catalog.messages_by_roast_level?.[roast_level] || [];
  const message_body = roast_messages.length
    ? roast_messages[get_notification_id(workout_date, message_variant) % roast_messages.length]
    : default_content.body;
  return {
    title: t(default_content.title).replaceAll('{workout_time}', workout_time),
    body: t(message_body).replaceAll('{workout_time}', workout_time),
  };
}

function build_notifications(settings, today_data, notification_catalog) {
  const time_zone = settings.timezone || today_data.timezone || 'Asia/Seoul';
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
          ...get_notification_content(notification_catalog, 'free_workout', settings.roast_level, settings.workout_time, workout_date),
        }));
      }
      continue;
    }

    if (is_active_session && is_snoozed_session && settings.notification_snooze_enabled) {
      notifications.push(create_notification({
        workout_date,
        notification_kind: 'snooze',
        at: create_scheduled_date(workout_date, workout_time, time_zone),
        ...get_notification_content(notification_catalog, 'snooze', settings.roast_level, workout_time, workout_date),
      }));
    } else if (is_active_session && settings.notification_workout_enabled) {
      notifications.push(create_notification({
        workout_date,
        notification_kind: 'workout',
        at: create_scheduled_date(workout_date, workout_time, time_zone, -workout_reminder_lead_minutes),
        ...get_notification_content(notification_catalog, 'workout', settings.roast_level, workout_time, workout_date),
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
          ...get_notification_content(notification_catalog, 'missed', settings.roast_level, workout_time, workout_date, `missed_${reminder_number}`),
        }));
      }
    }
  }

  return notifications.filter(Boolean);
}

function build_background_notification_rules(settings, notification_catalog) {
  const schedule_days = new Set(settings.schedule_days);
  const rules = [];
  const add_rule = (weekday, notification_kind, offset_minutes) => {
    const content_kind = notification_kind.startsWith('missed_') ? 'missed' : notification_kind;
    const default_content = notification_catalog.defaults[content_kind];
    const roast_messages = content_kind === 'free_workout'
      ? [] : notification_catalog.messages_by_roast_level?.[settings.roast_level] || [];
    rules.push({
      weekday,
      notification_kind,
      kind_code: notification_kind_codes[notification_kind],
      workout_time: settings.workout_time,
      offset_minutes,
      title: t(default_content.title).replaceAll('{workout_time}', settings.workout_time),
      message_bodies: (roast_messages.length ? roast_messages : [default_content.body])
        .map((body) => t(body).replaceAll('{workout_time}', settings.workout_time)),
    });
  };
  for (let weekday = 0; weekday < 7; weekday += 1) {
    if (!schedule_days.has(weekday)) {
      if (settings.notification_free_workout_enabled) add_rule(weekday, 'free_workout', 0);
      continue;
    }
    if (settings.notification_workout_enabled) add_rule(weekday, 'workout', -workout_reminder_lead_minutes);
    if (settings.notification_missed_enabled) {
      for (let reminder_number = 1; reminder_number <= missed_reminder_repeat_count; reminder_number += 1) {
        add_rule(weekday, `missed_${reminder_number}`,
          missed_reminder_delay_minutes + (reminder_number - 1) * missed_reminder_interval_minutes);
      }
    }
  }
  // Snoozes and today's attendance/rest overrides stay in the one-off schedule.
  return rules;
}

async function cancel_scheduled_notifications(time_zone = 'Asia/Seoul') {
  if (Capacitor.getPlatform() === 'android') await workout_reminder.clear();
  const notification_ids = [];
  for (let day_offset = 0; day_offset <= notification_cancel_horizon_days; day_offset += 1) {
    const workout_date = add_calendar_days(get_current_workout_date(time_zone), day_offset);
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

async function reconcile_scheduled_notifications(notifications) {
  let pending_notifications;
  try {
    pending_notifications = (await LocalNotifications.getPending()).notifications;
  } catch (error) {
    console.warn('[WORKOUT_NOTIFICATION_PENDING_CHECK_ERROR]', error);
    await cancel_scheduled_notifications();
    const schedule_result = notifications.length
      ? await LocalNotifications.schedule({ notifications })
      : { notifications: [] };
    return { scheduled_count: schedule_result.notifications.length, retained_count: 0, removed_count: 0 };
  }

  const pending_workout_notifications = pending_notifications
    .filter((notification) => notification.extra?.source === notification_source);
  const pending_by_id = new Map(pending_workout_notifications.map((notification) => [notification.id, notification]));
  const desired_ids = new Set(notifications.map((notification) => notification.id));
  const removed_ids = pending_workout_notifications
    .filter((notification) => !desired_ids.has(notification.id))
    .map((notification) => notification.id);
  const notifications_to_schedule = notifications.filter((notification) => {
    const pending_notification = pending_by_id.get(notification.id);
    return !pending_notification
      || pending_notification.extra?.scheduled_at !== notification.extra.scheduled_at
      || pending_notification.title !== notification.title
      || pending_notification.body !== notification.body;
  });

  if (removed_ids.length) {
    await LocalNotifications.cancel({ notifications: removed_ids.map((id) => ({ id })) });
  }
  if (notifications_to_schedule.length) {
    await LocalNotifications.schedule({ notifications: notifications_to_schedule });
  }
  return {
    scheduled_count: notifications.length,
    retained_count: notifications.length - notifications_to_schedule.length,
    removed_count: removed_ids.length,
  };
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

export async function prepare_workout_notifications_for_user(user_uuid) {
  if (!Capacitor.isNativePlatform()) return;
  const previous_user_uuid = window.localStorage.getItem(notification_owner_storage_key);
  if (previous_user_uuid && previous_user_uuid !== user_uuid) {
    await cancel_scheduled_notifications();
  }
  window.localStorage.setItem(notification_owner_storage_key, user_uuid);
}

export async function sync_workout_notifications({
  user_uuid,
  settings,
  today_data,
  notification_catalog,
  notification_catalog_source = 'remote',
}) {
  if (!Capacitor.isNativePlatform()) {
    return record_workout_notification_sync('unsupported', { supported: false, scheduled_count: 0 });
  }
  await prepare_workout_notifications_for_user(user_uuid);

  if (!settings || !today_data || !Array.isArray(settings.schedule_days) || !has_enabled_notifications(settings)) {
    await cancel_scheduled_notifications(settings?.timezone || today_data?.timezone || 'Asia/Seoul');
    return record_workout_notification_sync('cancelled', {
      supported: true,
      scheduled_count: 0,
      reason: !settings || !today_data ? 'settings_or_today_missing' : 'no_enabled_notification_type',
      schedule_days: settings?.schedule_days || null,
      workout_time: settings?.workout_time || null,
      workout_date: today_data?.workout_date || null,
    });
  }

  if (!notification_catalog) {
    return record_workout_notification_sync('skipped', {
      supported: true,
      skipped: true,
      reason: 'notification_catalog_missing',
      schedule_days: settings.schedule_days,
      workout_time: settings.workout_time,
      workout_date: today_data.workout_date,
    });
  }
  if (settings.timezone && today_data.timezone !== settings.timezone) {
    return record_workout_notification_sync('skipped', {
      supported: true,
      reason: 'timezone_data_out_of_sync',
      settings_timezone: settings.timezone,
      today_timezone: today_data.timezone,
    });
  }
  const notifications = build_notifications(settings, today_data, notification_catalog);
  const permission_status = await ensure_notification_permission();
  if (permission_status.display !== 'granted') {
    return record_workout_notification_sync('permission_denied', {
      supported: true,
      permission: permission_status.display,
      scheduled_count: 0,
      candidate_count: notifications.length,
      catalog_source: notification_catalog_source,
      schedule_days: settings.schedule_days,
      workout_time: settings.workout_time,
      workout_date: today_data.workout_date,
    });
  }

  let exact_alarm_status = null;
  if (Capacitor.getPlatform() === 'android') {
    try {
      exact_alarm_status = (await LocalNotifications.checkExactNotificationSetting()).exact_alarm;
    } catch (error) {
      console.warn('[EXACT_ALARM_SETTING_CHECK_ERROR]', error);
    }
  }
  await prepare_notification_channel();
  try {
    const schedule_result = await reconcile_scheduled_notifications(notifications);
    const background_renewal = Capacitor.getPlatform() === 'android'
      ? await workout_reminder.updatePlan({
        user_uuid,
        timezone: settings.timezone || today_data.timezone || 'Asia/Seoul',
        synced_workout_date: today_data.workout_date,
        horizon_days: notification_horizon_days,
        rules: build_background_notification_rules(settings, notification_catalog),
      })
      : null;
    return record_workout_notification_sync('scheduled', {
      supported: true,
      permission: permission_status.display,
      exact_alarm: exact_alarm_status,
      ...schedule_result,
      background_renewal,
      candidate_count: notifications.length,
      schedule_days: settings.schedule_days,
      timezone: settings.timezone || today_data.timezone,
      catalog_source: notification_catalog_source,
      workout_time: settings.workout_time,
      workout_date: today_data.workout_date,
      next_candidate_at: notifications
        .map((notification) => notification.schedule.at.toISOString())
        .sort()[0] || null,
    });
  } catch (error) {
    record_workout_notification_sync('schedule_failed', {
      supported: true,
      permission: permission_status.display,
      exact_alarm: exact_alarm_status,
      candidate_count: notifications.length,
      schedule_days: settings.schedule_days,
      workout_time: settings.workout_time,
      workout_date: today_data.workout_date,
      catalog_source: notification_catalog_source,
      error: error.message || 'unknown',
    });
    throw error;
  }
}

export async function clear_workout_notifications() {
  if (Capacitor.isNativePlatform()) await cancel_scheduled_notifications();
  window.localStorage.removeItem(notification_owner_storage_key);
}

export async function inspect_workout_notifications(time_zone = 'Asia/Seoul') {
  if (!Capacitor.isNativePlatform()) return { supported: false };

  const [permission, enabled, pending, exact_alarm, background_renewal] = await Promise.all([
    LocalNotifications.checkPermissions(),
    LocalNotifications.areEnabled(),
    LocalNotifications.getPending(),
    Capacitor.getPlatform() === 'android'
      ? LocalNotifications.checkExactNotificationSetting()
      : Promise.resolve(null),
    Capacitor.getPlatform() === 'android' ? workout_reminder.getStatus() : Promise.resolve(null),
  ]);

  return {
    supported: true,
    last_sync: last_workout_notification_sync,
    platform: Capacitor.getPlatform(),
    timezone: time_zone,
    permission: permission.display,
    notifications_enabled: enabled.value,
    exact_alarm: exact_alarm?.exact_alarm ?? 'not_applicable',
    background_renewal,
    pending: pending.notifications
      .filter((notification) => notification.extra?.source === notification_source
        || notification.extra?.source === 'donskipworkout-notification-debug')
      .map((notification) => ({
        id: notification.id,
        title: notification.title,
        kind: notification.extra?.notification_kind || 'debug_test',
        workout_date: notification.extra?.workout_date || null,
        scheduled_at: notification.extra?.scheduled_at || notification.schedule?.at || null,
        scheduled_local: notification.extra?.scheduled_at
          ? new Intl.DateTimeFormat('sv-SE', {
            timeZone: time_zone, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
          }).format(new Date(notification.extra.scheduled_at))
          : null,
      })),
  };
}

export async function schedule_notification_debug_test(time_zone = 'Asia/Seoul') {
  if (!Capacitor.isNativePlatform()) return { supported: false };

  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') {
    return { ...(await inspect_workout_notifications(time_zone)), test_scheduled: false, reason: 'permission_not_granted' };
  }

  await prepare_notification_channel();
  const scheduled_at = new Date(Date.now() + 15000);
  const test_id = Math.floor(Date.now() / 1000);
  const schedule_result = await LocalNotifications.schedule({
    notifications: [{
      id: test_id,
      title: '알림 테스트',
      body: '15초 전에 예약한 로컬 알림입니다.',
      channelId: notification_channel_id,
      extra: { source: 'donskipworkout-notification-debug' },
      schedule: { at: scheduled_at, allowWhileIdle: true },
    }],
  });

  return {
    ...(await inspect_workout_notifications(time_zone)),
    test_scheduled: schedule_result.notifications.some(({ id }) => id === test_id),
    test_id,
    test_scheduled_at: scheduled_at.toISOString(),
  };
}

export async function open_exact_alarm_settings() {
  if (Capacitor.getPlatform() !== 'android') return { supported: false };
  return LocalNotifications.changeExactNotificationSetting();
}
