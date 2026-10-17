package com.donskip.attendancecheck;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import com.getcapacitor.JSObject;
import org.json.JSONException;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;

import java.util.UUID;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;

final class WorkoutLocationStore {
    static final String START_REQUEST_ID = "workout_start_request_id";
    private static final String PREFERENCES = "workout_location";
    private static final String GEOFENCE_ID = "workout_place";
    private static final String CHANNEL_ID = "workout_location_arrival";
    private static final int NOTIFICATION_ID = 72581;
    private static final long START_VALIDITY_MS = 30 * 60 * 1000L;

    private WorkoutLocationStore() {}

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    static boolean hasBackgroundPermission(Context context) {
        return Build.VERSION.SDK_INT < 29
            || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean hasFinePermission(Context context) {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static PendingIntent geofenceIntent(Context context) {
        Intent intent = new Intent(context, WorkoutGeofenceReceiver.class);
        return PendingIntent.getBroadcast(context, 72580, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
    }

    static Task<Void> register(Context context) {
        SharedPreferences settings = preferences(context);
        if (!settings.contains("latitude") || !hasFinePermission(context) || !hasBackgroundPermission(context))
            return Tasks.forException(new IllegalStateException("Location setup is incomplete"));
        double latitude = Double.longBitsToDouble(settings.getLong("latitude", 0));
        double longitude = Double.longBitsToDouble(settings.getLong("longitude", 0));
        Geofence fence = new Geofence.Builder()
            .setRequestId(GEOFENCE_ID)
            .setCircularRegion(latitude, longitude, 150f)
            .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_DWELL | Geofence.GEOFENCE_TRANSITION_EXIT)
            .setLoiteringDelay(120000)
            .setNotificationResponsiveness(180000)
            .setExpirationDuration(Geofence.NEVER_EXPIRE)
            .build();
        GeofencingRequest request = new GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_DWELL)
            .addGeofence(fence)
            .build();
        try {
            Task<Void> registration = LocationServices.getGeofencingClient(context).addGeofences(request, geofenceIntent(context));
            registration.addOnSuccessListener(unused -> settings.edit().putBoolean("monitoring_error", false).apply());
            registration.addOnFailureListener(error -> {
                settings.edit().putBoolean("monitoring_error", true).apply();
                Log.e("WorkoutLocation", "Geofence registration failed", error);
            });
            return registration;
        } catch (SecurityException error) {
            Log.e("WorkoutLocation", "Location permission missing", error);
            return Tasks.forException(error);
        }
    }

    static Task<Void> remove(Context context) {
        Task<Void> removal = LocationServices.getGeofencingClient(context).removeGeofences(geofenceIntent(context));
        removal.addOnFailureListener(error -> Log.w("WorkoutLocation", "Geofence removal failed", error));
        ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(NOTIFICATION_ID);
        return removal;
    }

    static void savePendingStart(Context context, String request_id) {
        SharedPreferences settings = preferences(context);
        if (!request_id.equals(settings.getString("notification_request_id", ""))) return;
        long notified_at = settings.getLong("notified_at", 0);
        if (!settings.getBoolean("inside", false) || System.currentTimeMillis() - notified_at > START_VALIDITY_MS) return;
        settings.edit().putString("pending_start_request_id", request_id).apply();
    }

    static void showArrival(Context context) {
        SharedPreferences settings = preferences(context);
        if (!settings.contains("latitude") || settings.getBoolean("inside", false)) return;
        String request_id = UUID.randomUUID().toString();
        settings.edit().putBoolean("inside", true)
            .putString("notification_request_id", request_id)
            .putLong("notified_at", System.currentTimeMillis()).apply();
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "운동 장소 도착", NotificationManager.IMPORTANCE_DEFAULT));
        }
        Intent start_intent = new Intent(context, MainActivity.class)
            .putExtra(START_REQUEST_ID, request_id)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent start_action = PendingIntent.getActivity(context, NOTIFICATION_ID, start_intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        boolean english = "en".equals(settings.getString("language", "ko"));
        String location_name = settings.getString("name", english ? "Workout place" : "운동 장소");
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_attendance)
            .setContentTitle(english ? "Arrived at " + location_name : location_name + "에 도착했어요")
            .setContentText(english ? "Start your workout timer?" : "운동 타이머를 시작할까요?")
            .setAutoCancel(true)
            .setContentIntent(start_action)
            .addAction(R.drawable.ic_stat_attendance, english ? "Start workout" : "운동 시작", start_action);
        manager.notify(NOTIFICATION_ID, notification.build());
    }

    static void leave(Context context) {
        recordExit(context);
        preferences(context).edit().putBoolean("inside", false)
            .remove("notification_request_id").remove("pending_start_request_id").apply();
        ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(NOTIFICATION_ID);
    }

    static synchronized JSObject recordExit(Context context) {
        SharedPreferences settings = preferences(context);
        String pending_exit = settings.getString("pending_exit", "");
        if (!pending_exit.isEmpty()) return readExit(context);
        String active_timer = settings.getString("active_timer", "");
        if (active_timer.isEmpty() || !settings.contains("latitude")) return new JSObject();
        try {
            JSObject exit = new JSObject(active_timer);
            exit.put("request_id", UUID.randomUUID().toString());
            exit.put("exited_at", System.currentTimeMillis());
            // Persist before the background receiver returns, retaining the first exit.
            settings.edit().putString("pending_exit", exit.toString()).remove("active_timer").commit();
            return exit;
        } catch (JSONException error) {
            Log.e("WorkoutLocation", "Cannot read active workout timer", error);
            return new JSObject();
        }
    }

    static JSObject readExit(Context context) {
        try {
            return new JSObject(preferences(context).getString("pending_exit", "{}"));
        } catch (JSONException error) {
            Log.e("WorkoutLocation", "Cannot read pending location exit", error);
            return new JSObject();
        }
    }

}

