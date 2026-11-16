-- Keep existing round calendars; new rounds snapshot the host account timezone.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10s';

ALTER TABLE attendance.challenge_rounds
    DROP CONSTRAINT IF EXISTS challenge_rounds_timezone_check,
    ALTER COLUMN timezone TYPE VARCHAR(64);

COMMIT;
