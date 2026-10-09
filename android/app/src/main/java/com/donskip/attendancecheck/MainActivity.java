package com.donskip.attendancecheck;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle saved_instance_state) {
        registerPlugin(WorkoutLocationPlugin.class);
        registerPlugin(WorkoutReminderPlugin.class);
        super.onCreate(saved_instance_state);
    }
}
