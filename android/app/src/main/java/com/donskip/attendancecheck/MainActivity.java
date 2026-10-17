package com.donskip.attendancecheck;

import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle saved_instance_state) {
        registerPlugin(WorkoutReminderPlugin.class);
        super.onCreate(saved_instance_state);
        getSharedPreferences("workout_location", MODE_PRIVATE).edit().clear().apply();
        NotificationManager notification_manager = getSystemService(NotificationManager.class);
        if (notification_manager != null) {
            notification_manager.cancel(72581);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                notification_manager.deleteNotificationChannel("workout_location_arrival");
            }
        }
    }
}
