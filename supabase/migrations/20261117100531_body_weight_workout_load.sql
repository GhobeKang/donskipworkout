SET lock_timeout = '5s';
SET statement_timeout = '15s';

ALTER TABLE attendance.workout_sets
    ADD COLUMN body_weight_kg numeric(5, 2),
    ADD CONSTRAINT workout_sets_body_weight_check
        CHECK (body_weight_kg > 0 AND body_weight_kg <= 500);

-- Unknown historical measurements stay NULL. Never infer them from today's profile.
COMMENT ON COLUMN attendance.workout_sets.body_weight_kg IS
    'Body weight captured with the workout. Zero entered load uses this weight; negative entered load subtracts assistance. NULL means unknown.';
COMMENT ON COLUMN attendance.workout_sets.weight_kg IS
    'Signed entered load in kg: positive = external weight, zero = bodyweight, negative = assistance. Assisted effective load is max(body_weight_kg + weight_kg, 0).';
COMMENT ON COLUMN attendance.users.body_weight_kg IS
    'Optional latest self-reported body weight, captured with new workout records for bodyweight and assisted volume calculations.';
