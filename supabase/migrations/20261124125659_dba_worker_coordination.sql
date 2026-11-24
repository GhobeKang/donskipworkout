SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '15s';

CREATE TABLE attendance.worker_leases (
    worker_name VARCHAR(40) PRIMARY KEY CHECK (worker_name = 'maintenance'),
    instance_id VARCHAR(36) NOT NULL,
    heartbeat_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    lease_expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    worker_state JSONB NOT NULL CHECK (jsonb_typeof(worker_state) = 'object'),
    CHECK (lease_expires_at >= heartbeat_at)
);
ALTER TABLE attendance.worker_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON attendance.worker_leases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON attendance.worker_leases TO attendance_api;
CREATE POLICY backend_worker_access ON attendance.worker_leases
    FOR ALL TO attendance_api USING (true) WITH CHECK (true);
