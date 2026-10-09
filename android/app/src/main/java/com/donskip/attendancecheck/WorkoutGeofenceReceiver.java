package com.donskip.attendancecheck;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;

public class WorkoutGeofenceReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        GeofencingEvent event = GeofencingEvent.fromIntent(intent);
        if (event == null || event.hasError()) {
            Log.w("WorkoutLocation", "Geofence event unavailable");
            return;
        }
        int transition = event.getGeofenceTransition();
        if (transition == Geofence.GEOFENCE_TRANSITION_DWELL) WorkoutLocationStore.showArrival(context);
        else if (transition == Geofence.GEOFENCE_TRANSITION_EXIT) WorkoutLocationStore.leave(context);
    }
}

