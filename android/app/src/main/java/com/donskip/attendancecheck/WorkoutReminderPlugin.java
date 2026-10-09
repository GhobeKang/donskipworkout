package com.donskip.attendancecheck;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WorkoutReminder")
public class WorkoutReminderPlugin extends Plugin {
    @PluginMethod
    public void updatePlan(PluginCall call) {
        try {
            JSObject plan = call.getData();
            WorkoutReminderScheduler.update_plan(getContext(), plan);
            call.resolve(WorkoutReminderScheduler.get_status(getContext()));
        } catch (Exception error) {
            call.reject("백그라운드 운동 알림 예약에 실패했습니다.", error);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        WorkoutReminderScheduler.clear(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(WorkoutReminderScheduler.get_status(getContext()));
    }
}
