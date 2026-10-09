package com.donskip.attendancecheck;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import com.capacitorjs.plugins.localnotifications.LocalNotification;
import com.capacitorjs.plugins.localnotifications.LocalNotificationManager;
import com.capacitorjs.plugins.localnotifications.LocalNotificationRestoreReceiver;
import com.capacitorjs.plugins.localnotifications.NotificationStorage;
import com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher;
import com.getcapacitor.CapConfig;
import com.getcapacitor.JSObject;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

public final class WorkoutReminderScheduler {
    static final String renewal_action = "com.donskip.attendancecheck.RENEW_WORKOUT_REMINDERS";
    private static final String notification_source = "donskipworkout-workout-reminder";
    private static final String preference_name = "workout_reminder_plan";
    private static final int renewal_alarm_id = -73001;
    private static final long calendar_day_ms = 86400000L;

    private WorkoutReminderScheduler() {}

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(preference_name, Context.MODE_PRIVATE);
    }

    static synchronized void update_plan(Context context, JSObject plan) throws Exception {
        JSONArray rules = plan.getJSONArray("rules");
        String timezone = plan.getString("timezone");
        if (plan.getString("user_uuid").isEmpty() || rules.length() > 28
            || !java.util.Arrays.asList(TimeZone.getAvailableIDs()).contains(timezone)) {
            throw new IllegalArgumentException("Invalid reminder owner, timezone or rules");
        }
        parse_calendar_date(plan.getString("synced_workout_date"));
        if (plan.getInt("horizon_days") < 1 || plan.getInt("horizon_days") > 30) {
            throw new IllegalArgumentException("Invalid reminder horizon");
        }
        for (int rule_index = 0; rule_index < rules.length(); rule_index++) {
            JSONObject rule = rules.getJSONObject(rule_index);
            if (rule.getInt("weekday") < 0 || rule.getInt("weekday") > 6
                || !java.util.Arrays.asList(1, 3, 11, 12, 13).contains(rule.getInt("kind_code"))
                || rule.getJSONArray("message_bodies").length() == 0) {
                throw new IllegalArgumentException("Invalid reminder rule");
            }
            scheduled_timestamp(plan.getString("synced_workout_date"), rule.getString("workout_time"),
                timezone, rule.getInt("offset_minutes"));
        }
        if (rules.length() == 0) {
            stop_renewal(context);
            return;
        }
        if (!preferences(context).edit().putString("plan", plan.toString()).commit()) {
            throw new IllegalStateException("Reminder plan could not be persisted");
        }
        refresh(context);
    }

    static synchronized void clear(Context context) {
        stop_renewal(context);
        NotificationStorage notification_storage = new NotificationStorage(context);
        for (LocalNotification notification : notification_storage.getSavedNotifications()) {
            JSObject extra = notification.getExtra();
            if (extra != null && notification_source.equals(extra.optString("source"))) {
                cancel_notification(context, notification_storage, notification.getId());
            }
        }
    }

    private static void stop_renewal(Context context) {
        AlarmManager alarm_manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent renewal_intent = renewal_pending_intent(context);
        alarm_manager.cancel(renewal_intent);
        renewal_intent.cancel();
        preferences(context).edit().clear().commit();
    }

    static synchronized void restore(Context context, Intent intent) throws Exception {
        if (!renewal_action.equals(intent.getAction())) {
            prune_expired_notifications(context);
            new LocalNotificationRestoreReceiver().onReceive(context, intent);
        }
        refresh(context);
    }

    static synchronized JSObject get_status(Context context) {
        SharedPreferences saved_status = preferences(context);
        JSObject status = new JSObject();
        status.put("enabled", saved_status.contains("plan"));
        status.put("last_refill_at", saved_status.getString("last_refill_at", null));
        status.put("next_renewal_at", saved_status.getString("next_renewal_at", null));
        status.put("last_error", saved_status.getString("last_error", null));
        status.put("alarm_mode", saved_status.getString("alarm_mode", null));
        status.put("notification_alarm_mode", saved_status.contains("last_exact_alarm_allowed")
            ? (saved_status.getBoolean("last_exact_alarm_allowed", false) ? "exact_while_idle" : "inexact_while_idle") : null);
        status.put("added_count", saved_status.getInt("added_count", 0));
        return status;
    }

    static synchronized void refresh(Context context) throws Exception {
        String saved_plan = preferences(context).getString("plan", null);
        if (saved_plan == null) return;
        JSONObject plan = new JSONObject(saved_plan);
        try {
            AlarmManager alarm_manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            boolean exact_allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarm_manager.canScheduleExactAlarms();
            SharedPreferences saved_status = preferences(context);
            if (saved_status.contains("last_exact_alarm_allowed")
                && saved_status.getBoolean("last_exact_alarm_allowed", false) != exact_allowed) {
                // Revoking this permission removes OS alarms, but leaves the plugin's saved JSON intact.
                // Reapply those saved notifications rather than mistaking storage entries for live alarms.
                prune_expired_notifications(context);
                new LocalNotificationRestoreReceiver().onReceive(context, new Intent(renewal_action));
            }
            refill_notifications(context, plan);
            preferences(context).edit().putString("last_refill_at", iso_timestamp(System.currentTimeMillis()))
                .putBoolean("last_exact_alarm_allowed", exact_allowed).remove("last_error").apply();
        } catch (Exception error) {
            preferences(context).edit().putString("last_error", error.toString()).apply();
            throw error;
        } finally {
            // Keep renewing even when a single refill fails; no WebView or network request is required.
            schedule_renewal(context, plan.getString("timezone"));
        }
    }

    private static void refill_notifications(Context context, JSONObject plan) throws Exception {
        String timezone = plan.getString("timezone");
        String synced_workout_date = plan.getString("synced_workout_date");
        SimpleDateFormat date_formatter = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        date_formatter.setTimeZone(TimeZone.getTimeZone(timezone));
        String today_date = date_formatter.format(new Date());
        Calendar workout_calendar = parse_calendar_date(today_date);
        // Yesterday's late workout can still have reminders due after midnight today.
        workout_calendar.add(Calendar.DAY_OF_MONTH, -1);
        JSONArray rules = plan.getJSONArray("rules");
        NotificationStorage notification_storage = new NotificationStorage(context);
        List<LocalNotification> notifications_to_schedule = new ArrayList<>();
        Set<Integer> desired_ids = new HashSet<>();
        long now_ms = System.currentTimeMillis();

        for (int day_offset = -1; day_offset <= plan.getInt("horizon_days"); day_offset++) {
            String workout_date = format_calendar_date(workout_calendar);
            int weekday = workout_calendar.get(Calendar.DAY_OF_WEEK) - 1;
            // Do not recreate alerts cancelled by attendance, rest or snooze on the last synced day.
            if (workout_date.compareTo(synced_workout_date) > 0) {
                for (int rule_index = 0; rule_index < rules.length(); rule_index++) {
                    JSONObject rule = rules.getJSONObject(rule_index);
                    if (rule.getInt("weekday") != weekday) continue;
                    long at_ms = scheduled_timestamp(workout_date, rule.getString("workout_time"),
                        timezone, rule.getInt("offset_minutes"));
                    int notification_id = notification_id(workout_date, rule.getInt("kind_code"));
                    if (at_ms <= now_ms + 5000) {
                        // Keep recently due alarms that Android may still be delivering in Doze.
                        if (at_ms > now_ms - calendar_day_ms
                            && notification_storage.getSavedNotificationAsJSObject(Integer.toString(notification_id)) != null) {
                            desired_ids.add(notification_id);
                        }
                        continue;
                    }
                    desired_ids.add(notification_id);
                    JSONArray message_bodies = rule.getJSONArray("message_bodies");
                    JSObject notification = new JSObject();
                    notification.put("id", notification_id);
                    notification.put("title", rule.getString("title"));
                    notification.put("body", message_bodies.getString(notification_id % message_bodies.length()));
                    notification.put("channelId", "workout-reminders");
                    JSObject extra = new JSObject();
                    extra.put("source", notification_source);
                    extra.put("workout_date", workout_date);
                    extra.put("notification_kind", rule.getString("notification_kind"));
                    extra.put("scheduled_at", iso_timestamp(at_ms));
                    notification.put("extra", extra);
                    JSObject schedule = new JSObject();
                    schedule.put("at", iso_timestamp(at_ms));
                    schedule.put("allowWhileIdle", true);
                    notification.put("schedule", schedule);
                    JSObject saved_notification = notification_storage.getSavedNotificationAsJSObject(Integer.toString(notification_id));
                    if (saved_notification == null || !notification.toString().equals(saved_notification.toString())) {
                        notifications_to_schedule.add(LocalNotification.buildNotificationFromJSObject(notification));
                    }
                }
            }
            workout_calendar.add(Calendar.DAY_OF_MONTH, 1);
        }

        for (LocalNotification saved_notification : notification_storage.getSavedNotifications()) {
            JSObject extra = saved_notification.getExtra();
            if (extra != null && notification_source.equals(extra.optString("source"))
                && extra.optString("workout_date").compareTo(synced_workout_date) > 0
                && !desired_ids.contains(saved_notification.getId())) {
                cancel_notification(context, notification_storage, saved_notification.getId());
            }
        }
        if (!notifications_to_schedule.isEmpty()) {
            LocalNotificationManager notification_manager = new LocalNotificationManager(
                notification_storage, null, context, CapConfig.loadDefault(context));
            JSONArray scheduled_ids = notification_manager.schedule(null, notifications_to_schedule);
            if (scheduled_ids == null || scheduled_ids.length() != notifications_to_schedule.size()) {
                throw new IllegalStateException("Notifications are disabled or could not be scheduled");
            }
            notification_storage.appendNotifications(notifications_to_schedule);
        }
        preferences(context).edit().putInt("added_count", notifications_to_schedule.size()).apply();
    }

    static synchronized void prune_expired_notifications(Context context) {
        NotificationStorage notification_storage = new NotificationStorage(context);
        for (LocalNotification notification : notification_storage.getSavedNotifications()) {
            JSObject extra = notification.getExtra();
            if (extra != null && notification_source.equals(extra.optString("source"))
                && notification.getSchedule() != null && notification.getSchedule().getAt() != null
                && notification.getSchedule().getAt().getTime() <= System.currentTimeMillis()) {
                cancel_notification(context, notification_storage, notification.getId());
            }
        }
    }

    private static void cancel_notification(Context context, NotificationStorage notification_storage, int notification_id) {
        Intent alarm_intent = new Intent(context, TimedNotificationPublisher.class);
        int flags = PendingIntent.FLAG_NO_CREATE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
        PendingIntent pending_intent = PendingIntent.getBroadcast(context, notification_id, alarm_intent, flags);
        if (pending_intent != null) {
            ((AlarmManager) context.getSystemService(Context.ALARM_SERVICE)).cancel(pending_intent);
            pending_intent.cancel();
        }
        notification_storage.deleteNotification(Integer.toString(notification_id));
    }

    private static PendingIntent renewal_pending_intent(Context context) {
        Intent renewal_intent = new Intent(context, WorkoutReminderReceiver.class).setAction(renewal_action);
        return PendingIntent.getBroadcast(context, renewal_alarm_id, renewal_intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void schedule_renewal(Context context, String timezone) {
        Calendar next_renewal = Calendar.getInstance(TimeZone.getTimeZone(timezone));
        next_renewal.add(Calendar.DAY_OF_MONTH, 1);
        next_renewal.set(Calendar.HOUR_OF_DAY, 0);
        next_renewal.set(Calendar.MINUTE, 5);
        next_renewal.set(Calendar.SECOND, 0);
        next_renewal.set(Calendar.MILLISECOND, 0);
        long next_renewal_ms = next_renewal.getTimeInMillis();
        AlarmManager alarm_manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pending_intent = renewal_pending_intent(context);
        // A 30-day buffer makes precise renewal unnecessary. This alarm must survive exact-alarm revocation.
        alarm_manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next_renewal_ms, pending_intent);
        preferences(context).edit().putString("next_renewal_at", iso_timestamp(next_renewal_ms))
            .putString("alarm_mode", "inexact_while_idle").apply();
    }

    static int notification_id(String workout_date, int kind_code) throws ParseException {
        return (int) (parse_calendar_date(workout_date).getTimeInMillis() / calendar_day_ms) * 100 + kind_code;
    }

    static Calendar parse_calendar_date(String workout_date) throws ParseException {
        SimpleDateFormat date_formatter = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        date_formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        date_formatter.setLenient(false);
        Calendar workout_calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        workout_calendar.setTime(date_formatter.parse(workout_date));
        return workout_calendar;
    }

    static String format_calendar_date(Calendar workout_calendar) {
        SimpleDateFormat date_formatter = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        date_formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        return date_formatter.format(workout_calendar.getTime());
    }

    static long scheduled_timestamp(String workout_date, String workout_time, String timezone, int offset_minutes) throws ParseException {
        String[] time_parts = workout_time.split(":");
        int hour = Integer.parseInt(time_parts[0]);
        int minute = Integer.parseInt(time_parts[1]);
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new IllegalArgumentException("Invalid workout time");
        Calendar wall_clock = parse_calendar_date(workout_date);
        wall_clock.set(Calendar.HOUR_OF_DAY, hour);
        wall_clock.set(Calendar.MINUTE, minute);
        long wall_clock_ms = wall_clock.getTimeInMillis();
        TimeZone workout_timezone = TimeZone.getTimeZone(timezone);
        long matching_timestamp = Long.MAX_VALUE;
        long next_timestamp = 0;
        long smallest_gap = Long.MAX_VALUE;
        // Match the JS scheduler: earliest repeated clock time, or shift forward across a DST gap.
        for (int offset_hours : new int[] {-36, 0, 36}) {
            long candidate_ms = wall_clock_ms - workout_timezone.getOffset(wall_clock_ms + offset_hours * 3600000L);
            long difference_ms = candidate_ms + workout_timezone.getOffset(candidate_ms) - wall_clock_ms;
            if (difference_ms == 0) matching_timestamp = Math.min(matching_timestamp, candidate_ms);
            else if (difference_ms > 0 && difference_ms < smallest_gap) {
                smallest_gap = difference_ms;
                next_timestamp = candidate_ms;
            }
        }
        long timestamp = matching_timestamp != Long.MAX_VALUE ? matching_timestamp : next_timestamp;
        if (timestamp == 0) throw new IllegalArgumentException("Workout time could not be resolved");
        return timestamp + offset_minutes * 60000L;
    }

    private static String iso_timestamp(long timestamp_ms) {
        SimpleDateFormat timestamp_formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        timestamp_formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        return timestamp_formatter.format(new Date(timestamp_ms));
    }
}
