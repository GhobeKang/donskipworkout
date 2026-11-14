-- Negative values record assistance for bodyweight exercises, not lifted weight.
-- Version matches the applied Supabase migration history.
-- Preserve existing rows and the NUMERIC(5, 2) precision and upper bound.
SET lock_timeout = '5s';
SET statement_timeout = '15s';

ALTER TABLE attendance.workout_sets
    DROP CONSTRAINT workout_sets_weight_kg_check,
    ADD CONSTRAINT workout_sets_weight_kg_check
        CHECK (weight_kg BETWEEN -999.99 AND 999.99);

COMMENT ON COLUMN attendance.workout_sets.weight_kg IS
    'Signed external load in kg: negative = assistance, zero = bodyweight, positive = additional load. Bodyweight is not stored; negative sets are excluded from volume totals.';

RESET lock_timeout;
RESET statement_timeout;
