SET lock_timeout = '5s';
SET statement_timeout = '15s';

ALTER TABLE attendance.users
    ADD COLUMN body_weight_kg numeric(5, 2),
    ADD COLUMN body_weight_recorded_at timestamp without time zone,
    ADD CONSTRAINT users_body_weight_check CHECK (body_weight_kg > 0 AND body_weight_kg <= 500);

-- Absence of a row exempts all existing accounts. Only new signups are enrolled.
CREATE TABLE attendance.user_onboarding (
    user_id bigint PRIMARY KEY REFERENCES attendance.users(user_id) ON DELETE CASCADE,
    version integer NOT NULL DEFAULT 1,
    status varchar(20) NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'in_progress', 'deferred', 'completed')),
    current_step integer NOT NULL DEFAULT 0 CHECK (current_step BETWEEN 0 AND 4),
    revision integer NOT NULL DEFAULT 0,
    draft jsonb NOT NULL,
    completed_at timestamp without time zone
);

ALTER TABLE attendance.user_onboarding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON attendance.user_onboarding FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON attendance.user_onboarding TO attendance_api;
CREATE POLICY backend_access ON attendance.user_onboarding
    FOR ALL TO attendance_api USING (true) WITH CHECK (true);

COMMENT ON COLUMN attendance.users.body_weight_kg IS
    'Optional latest self-reported body weight in kg; not shared or used in workout volume.';
