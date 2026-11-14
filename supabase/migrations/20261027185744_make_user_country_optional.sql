-- Country is optional and must never be inferred when the user leaves it unset.
-- Existing values are preserved; users can clear them through settings.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10s';

ALTER TABLE attendance.users
    ALTER COLUMN country_code DROP NOT NULL,
    ALTER COLUMN country_code DROP DEFAULT;

COMMIT;
