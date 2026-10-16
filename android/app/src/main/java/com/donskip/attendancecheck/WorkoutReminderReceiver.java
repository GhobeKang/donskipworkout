package com.donskip.attendancecheck;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.UserManager;
import android.util.Log;

// Cancel pre-migration alarms on upgrade/boot; never replenish local alarms.
public class WorkoutReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            UserManager user_manager = context.getSystemService(UserManager.class);
            if (user_manager == null || !user_manager.isUserUnlocked()) return;
        }
        try { WorkoutReminderScheduler.clear(context); }
        catch (Exception error) { Log.e("WorkoutReminder", "Legacy alarm cleanup failed", error); }
    }
}
