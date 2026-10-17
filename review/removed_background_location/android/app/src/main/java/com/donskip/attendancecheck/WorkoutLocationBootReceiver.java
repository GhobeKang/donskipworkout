package com.donskip.attendancecheck;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.util.concurrent.atomic.AtomicBoolean;

public class WorkoutLocationBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())
            || !WorkoutLocationStore.preferences(context).contains("latitude")) return;
        PendingResult pending_result = goAsync();
        AtomicBoolean finished = new AtomicBoolean(false);
        Runnable finish = () -> {
            if (finished.compareAndSet(false, true)) pending_result.finish();
        };
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (!finished.get()) Log.w("WorkoutLocation", "Geofence restore timed out");
            finish.run();
        }, 8000);
        WorkoutLocationStore.register(context).addOnCompleteListener(task -> {
            if (!task.isSuccessful()) Log.w("WorkoutLocation", "Geofence restore failed", task.getException());
            finish.run();
        });
    }
}

