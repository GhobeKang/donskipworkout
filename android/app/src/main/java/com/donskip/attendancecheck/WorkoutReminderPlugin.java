package com.donskip.attendancecheck;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WorkoutReminder")
public class WorkoutReminderPlugin extends Plugin {
    @PluginMethod
    public void clear(PluginCall call) {
        try {
            WorkoutReminderScheduler.clear(getContext());
            call.resolve();
        } catch (Exception error) {
            call.reject("기존 운동 알림 정리에 실패했습니다.", error);
        }
    }
}
