SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '15s';

-- Leading FK indexes used by account deletion, parent deletion and direct lookups.
CREATE INDEX notification_outbox_device_idx ON attendance.notification_outbox(device_id);
CREATE INDEX notification_preferences_user_idx ON attendance.notification_preferences(user_id);
CREATE INDEX workout_timer_revisions_timer_idx ON attendance.workout_timer_revisions(timer_id);
CREATE INDEX workout_timer_revisions_actor_idx ON attendance.workout_timer_revisions(changed_by_user_id);
CREATE INDEX exercise_research_records_exercise_idx ON attendance.exercise_research_records(exercise_id);
CREATE INDEX exercise_research_records_shared_exercise_idx ON attendance.exercise_research_records(shared_exercise_id);
CREATE INDEX notification_events_sender_idx ON attendance.notification_events(sender_user_id);
CREATE INDEX user_shared_progress_exercise_idx ON attendance.user_shared_exercise_progress(shared_exercise_id);
