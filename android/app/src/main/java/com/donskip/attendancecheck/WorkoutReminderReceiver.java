package com.donskip.attendancecheck;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.UserManager;
import android.util.Log;

public class WorkoutReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            UserManager user_manager = context.getSystemService(UserManager.class);
            if (user_manager == null || !user_manager.isUserUnlocked()) return;
        }
        PendingResult pending_result = goAsync();
        new Thread(() -> {
            try {
                WorkoutReminderScheduler.restore(context, intent);
            } catch (Exception error) {
                Log.e("WorkoutReminder", "Native reminder renewal failed", error);
            } finally {
                pending_result.finish();
            }
        }, "workout-reminder-renewal").start();
    }
}
