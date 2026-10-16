package com.donskip.attendancecheck;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.capacitorjs.plugins.localnotifications.LocalNotification;
import com.capacitorjs.plugins.localnotifications.NotificationStorage;
import com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher;
import com.getcapacitor.JSObject;

// Migration cleanup only. Workout notifications are scheduled on the server.
public final class WorkoutReminderScheduler {
    private WorkoutReminderScheduler() {}

    static synchronized void clear(Context context) {
        AlarmManager alarm_manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent renewal_intent = new Intent(context, WorkoutReminderReceiver.class)
            .setAction("com.donskip.attendancecheck.RENEW_WORKOUT_REMINDERS");
        PendingIntent renewal_alarm = PendingIntent.getBroadcast(context, -73001, renewal_intent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (renewal_alarm != null) { alarm_manager.cancel(renewal_alarm); renewal_alarm.cancel(); }
        if (!context.getSharedPreferences("workout_reminder_plan", Context.MODE_PRIVATE).edit().clear().commit()) {
            throw new IllegalStateException("Legacy workout plan could not be cleared");
        }
        NotificationStorage notification_storage = new NotificationStorage(context);
        for (LocalNotification notification : notification_storage.getSavedNotifications()) {
            JSObject extra = notification.getExtra();
            if (extra == null || !"donskipworkout-workout-reminder".equals(extra.optString("source"))) continue;
            int flags = PendingIntent.FLAG_NO_CREATE;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent notification_alarm = PendingIntent.getBroadcast(context, notification.getId(),
                new Intent(context, TimedNotificationPublisher.class), flags);
            if (notification_alarm != null) { alarm_manager.cancel(notification_alarm); notification_alarm.cancel(); }
            notification_storage.deleteNotification(Integer.toString(notification.getId()));
        }
    }
}
