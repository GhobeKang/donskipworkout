package com.donskip.attendancecheck;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.SystemClock;
import android.provider.Settings;


import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;

@CapacitorPlugin(
    name = "WorkoutLocation",
    permissions = {
        @Permission(alias = "preciseLocation", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION })
    }
)
public class WorkoutLocationPlugin extends Plugin {
    @Override
    protected void handleOnNewIntent(Intent intent) {
        String request_id = intent == null ? null : intent.getStringExtra(WorkoutLocationStore.START_REQUEST_ID);
        if (request_id == null) return;
        WorkoutLocationStore.savePendingStart(getContext(), request_id);
        if (request_id.equals(WorkoutLocationStore.preferences(getContext()).getString("pending_start_request_id", ""))) {
            JSObject event = new JSObject();
            event.put("request_id", request_id);
            notifyListeners("startRequested", event, true);
        }
    }
    @PluginMethod
    public void getStatus(PluginCall call) {
        String user_uuid = call.getString("user_uuid", "");
        String saved_owner = WorkoutLocationStore.preferences(getContext()).getString("user_uuid", "");
        if (!saved_owner.isEmpty() && !saved_owner.equals(user_uuid)) {
            WorkoutLocationStore.remove(getContext());
            WorkoutLocationStore.preferences(getContext()).edit().clear().apply();
        }
        JSObject result = new JSObject();
        boolean precise = WorkoutLocationStore.hasFinePermission(getContext());
        boolean background = WorkoutLocationStore.hasBackgroundPermission(getContext());
        result.put("precise", precise);
        result.put("background", background);
        result.put("registered", WorkoutLocationStore.preferences(getContext()).contains("latitude") && precise && background
            && !WorkoutLocationStore.preferences(getContext()).getBoolean("monitoring_error", false));
        result.put("name", WorkoutLocationStore.preferences(getContext()).getString("name", ""));
        SharedPreferences saved_preferences = WorkoutLocationStore.preferences(getContext());
        if (saved_preferences.contains("latitude") && saved_preferences.contains("longitude")) {
            result.put("latitude", Double.longBitsToDouble(saved_preferences.getLong("latitude", 0)));
            result.put("longitude", Double.longBitsToDouble(saved_preferences.getLong("longitude", 0)));
        }
        call.resolve(result);
    }

    @PluginMethod
    public void requestForegroundPermission(PluginCall call) {
        if (WorkoutLocationStore.hasFinePermission(getContext())) {
            getStatus(call);
            return;
        }
        requestPermissionForAlias("preciseLocation", call, "foregroundPermissionCallback");
    }

    @PermissionCallback
    private void foregroundPermissionCallback(PluginCall call) {
        getStatus(call);
    }

    @PluginMethod
    public void openBackgroundSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:" + getContext().getPackageName()));
        getActivity().runOnUiThread(() -> getActivity().startActivity(intent));
        call.resolve();
    }

    @PluginMethod
    public void getCurrentPosition(PluginCall call) {
        if (!WorkoutLocationStore.hasFinePermission(getContext())) {
            call.reject("정확한 위치 권한을 먼저 허용해 주세요.");
            return;
        }
        CancellationTokenSource cancellation = new CancellationTokenSource();
        LocationServices.getFusedLocationProviderClient(getContext())
            .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancellation.getToken())
            .addOnSuccessListener(location -> {
                if (location == null || !location.hasAccuracy() || location.getAccuracy() > 150f
                    || SystemClock.elapsedRealtimeNanos() - location.getElapsedRealtimeNanos() > 30_000_000_000L) {
                    call.reject("현재 위치를 정확히 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
                    return;
                }
                JSObject result = new JSObject();
                result.put("latitude", location.getLatitude());
                result.put("longitude", location.getLongitude());
                result.put("accuracy", location.getAccuracy());
                call.resolve(result);
            })
            .addOnFailureListener(error -> call.reject("현재 위치를 가져오지 못했습니다.", error));
    }

    @PluginMethod
    public void savePlace(PluginCall call) {
        String user_uuid = call.getString("user_uuid", "");
        String name = call.getString("name", "").trim();
        Double latitude = call.getDouble("latitude");
        Double longitude = call.getDouble("longitude");
        if (user_uuid.isEmpty() || name.isEmpty() || name.length() > 40 || latitude == null || longitude == null
            || !Double.isFinite(latitude) || !Double.isFinite(longitude)
            || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
            call.reject("운동 장소 정보를 확인해 주세요.");
            return;
        }
        if (!WorkoutLocationStore.hasFinePermission(getContext()) || !WorkoutLocationStore.hasBackgroundPermission(getContext())) {
            call.reject("정확한 위치와 항상 허용 권한이 필요합니다.");
            return;
        }
        WorkoutLocationStore.remove(getContext()).addOnCompleteListener(removed -> {
            WorkoutLocationStore.preferences(getContext()).edit()
                .putString("user_uuid", user_uuid)
                .putString("name", name)
                .putString("language", call.getString("language", "ko"))
                .putLong("latitude", Double.doubleToRawLongBits(latitude))
                .putLong("longitude", Double.doubleToRawLongBits(longitude))
                .putBoolean("inside", false)
                .remove("active_timer").remove("pending_exit")
                .apply();
            WorkoutLocationStore.register(getContext())
                .addOnSuccessListener(unused -> call.resolve())
                .addOnFailureListener(error -> {
                    WorkoutLocationStore.remove(getContext());
                    WorkoutLocationStore.preferences(getContext()).edit().clear().apply();
                    call.reject("운동 장소 감시를 시작하지 못했습니다.", error);
                });
        });
    }

    @PluginMethod
    public void clearPlace(PluginCall call) {
        WorkoutLocationStore.remove(getContext());
        WorkoutLocationStore.preferences(getContext()).edit().clear().apply();
        call.resolve();
    }

    @PluginMethod
    public void peekPendingStart(PluginCall call) {
        String request_id = WorkoutLocationStore.preferences(getContext()).getString("pending_start_request_id", "");
        JSObject result = new JSObject();
        result.put("request_id", request_id);
        call.resolve(result);
    }

    @PluginMethod
    public void acknowledgePendingStart(PluginCall call) {
        String request_id = call.getString("request_id", "");
        if (request_id.equals(WorkoutLocationStore.preferences(getContext()).getString("pending_start_request_id", ""))) {
            WorkoutLocationStore.preferences(getContext()).edit().remove("pending_start_request_id").apply();
        }
        call.resolve();
    }

    @PluginMethod
    public void setActiveTimer(PluginCall call) {
        SharedPreferences settings = WorkoutLocationStore.preferences(getContext());
        String user_uuid = call.getString("user_uuid", "");
        if (!user_uuid.equals(settings.getString("user_uuid", "")) || !settings.contains("latitude")) {
            call.resolve();
            return;
        }
        String timer_uuid = call.getString("timer_uuid", "");
        Integer expected_revision = call.getInt("expected_revision", 0);
        if (timer_uuid.isEmpty() || expected_revision < 1) {
            settings.edit().remove("active_timer").apply();
        } else if (settings.getString("pending_exit", "").isEmpty()) {
            JSObject active_timer = new JSObject();
            active_timer.put("timer_uuid", timer_uuid);
            active_timer.put("expected_revision", expected_revision);
            active_timer.put("server_clock_offset", call.getDouble("server_clock_offset", 0.0));
            settings.edit().putString("active_timer", active_timer.toString()).apply();
        }
        call.resolve();
    }

    @PluginMethod
    public void peekPendingExit(PluginCall call) {
        call.resolve(WorkoutLocationStore.readExit(getContext()));
    }

    @PluginMethod
    public void recordExit(PluginCall call) {
        WorkoutLocationStore.leave(getContext());
        call.resolve(WorkoutLocationStore.readExit(getContext()));
    }

    @PluginMethod
    public void acknowledgePendingExit(PluginCall call) {
        String request_id = call.getString("request_id", "");
        if (request_id.equals(WorkoutLocationStore.readExit(getContext()).optString("request_id"))) {
            WorkoutLocationStore.preferences(getContext()).edit().remove("pending_exit").apply();
        }
        call.resolve();
    }

}

