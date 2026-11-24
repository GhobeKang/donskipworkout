SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '15s';

-- Abort rather than rewriting ownership or guessing a category for inconsistent data.
DO $preflight$
BEGIN
    IF EXISTS (
        SELECT 1 FROM attendance.workout_sets s
        JOIN attendance.workout_sessions w USING(session_id)
        JOIN attendance.exercise_items e USING(exercise_id)
        WHERE w.user_id <> e.user_id
    ) OR EXISTS (
        SELECT 1 FROM attendance.exercise_research_records r
        JOIN attendance.exercise_items e USING(exercise_id) WHERE r.user_id <> e.user_id
    ) THEN RAISE EXCEPTION 'Existing exercise ownership mismatch'; END IF;
    IF EXISTS (
        SELECT 1 FROM attendance.exercise_item_subareas l
        JOIN attendance.exercise_items e USING(exercise_id)
        JOIN attendance.exercise_subareas t USING(subarea_id)
        WHERE e.target_area IS DISTINCT FROM t.target_area
    ) OR EXISTS (
        SELECT 1 FROM attendance.shared_exercise_item_subareas l
        JOIN attendance.shared_exercise_items e USING(exercise_id)
        JOIN attendance.exercise_subareas t USING(subarea_id)
        WHERE e.target_area IS DISTINCT FROM t.target_area
    ) THEN RAISE EXCEPTION 'Existing exercise category mismatch'; END IF;
END $preflight$;

ALTER TABLE attendance.workout_sessions ADD CONSTRAINT workout_sessions_identity_owner_key UNIQUE(session_id,user_id);
ALTER TABLE attendance.exercise_items
    ADD CONSTRAINT exercise_items_identity_owner_key UNIQUE(exercise_id,user_id),
    ADD CONSTRAINT exercise_items_identity_area_key UNIQUE(exercise_id,target_area);
ALTER TABLE attendance.shared_exercise_items ADD CONSTRAINT shared_exercise_items_identity_area_key UNIQUE(exercise_id,target_area);
ALTER TABLE attendance.exercise_subareas ADD CONSTRAINT exercise_subareas_identity_area_key UNIQUE(subarea_id,target_area);

ALTER TABLE attendance.workout_sets ADD COLUMN user_id BIGINT;
UPDATE attendance.workout_sets s SET user_id=w.user_id FROM attendance.workout_sessions w WHERE w.session_id=s.session_id;
ALTER TABLE attendance.workout_sets
    ALTER COLUMN user_id SET NOT NULL,
    DROP CONSTRAINT workout_sets_session_id_fkey,
    ADD CONSTRAINT workout_sets_session_owner_fk FOREIGN KEY(session_id,user_id)
        REFERENCES attendance.workout_sessions(session_id,user_id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT workout_sets_exercise_owner_fk FOREIGN KEY(exercise_id,user_id)
        REFERENCES attendance.exercise_items(exercise_id,user_id) DEFERRABLE INITIALLY DEFERRED;
-- Existing single-column exercise FK keeps ON DELETE SET NULL and the saved name.
ALTER TABLE attendance.exercise_research_records
    ADD CONSTRAINT exercise_research_records_owner_fk FOREIGN KEY(exercise_id,user_id)
        REFERENCES attendance.exercise_items(exercise_id,user_id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE attendance.exercise_item_subareas ADD COLUMN target_area VARCHAR(20);
UPDATE attendance.exercise_item_subareas l SET target_area=e.target_area FROM attendance.exercise_items e WHERE e.exercise_id=l.exercise_id;
ALTER TABLE attendance.exercise_item_subareas
    ALTER COLUMN target_area SET NOT NULL,
    DROP CONSTRAINT exercise_item_subareas_exercise_id_fkey,
    DROP CONSTRAINT exercise_item_subareas_subarea_id_fkey,
    ADD CONSTRAINT exercise_item_subareas_exercise_area_fk FOREIGN KEY(exercise_id,target_area)
        REFERENCES attendance.exercise_items(exercise_id,target_area) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT exercise_item_subareas_target_area_fk FOREIGN KEY(subarea_id,target_area)
        REFERENCES attendance.exercise_subareas(subarea_id,target_area) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE attendance.shared_exercise_item_subareas ADD COLUMN target_area VARCHAR(20);
UPDATE attendance.shared_exercise_item_subareas l SET target_area=e.target_area FROM attendance.shared_exercise_items e WHERE e.exercise_id=l.exercise_id;
ALTER TABLE attendance.shared_exercise_item_subareas
    ALTER COLUMN target_area SET NOT NULL,
    DROP CONSTRAINT shared_exercise_item_subareas_exercise_id_fkey,
    DROP CONSTRAINT shared_exercise_item_subareas_subarea_id_fkey,
    ADD CONSTRAINT shared_exercise_item_subareas_exercise_area_fk FOREIGN KEY(exercise_id,target_area)
        REFERENCES attendance.shared_exercise_items(exercise_id,target_area) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT shared_exercise_item_subareas_target_area_fk FOREIGN KEY(subarea_id,target_area)
        REFERENCES attendance.exercise_subareas(subarea_id,target_area) DEFERRABLE INITIALLY DEFERRED;

-- Expand verified nonunique single-column indexes; keep their original leading lookup keys.
DO $indexes$
DECLARE expected record;
BEGIN
    FOR expected IN SELECT * FROM (VALUES
        ('workout_sets','idx_workout_sets_session_id','session_id'),
        ('workout_sets','idx_workout_sets_exercise_id','exercise_id'),
        ('exercise_item_subareas','exercise_item_subareas_subarea_idx','subarea_id'),
        ('shared_exercise_item_subareas','shared_exercise_item_subareas_subarea_idx','subarea_id')
    ) AS definitions(table_name,index_name,column_name) LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid
            JOIN pg_class x ON x.oid=i.indexrelid
            JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=i.indkey[0]
            WHERE t.relnamespace='attendance'::regnamespace AND t.relname=expected.table_name
              AND x.relname=expected.index_name AND a.attname=expected.column_name
              AND NOT i.indisunique AND i.indisvalid AND i.indnkeyatts=1 AND i.indpred IS NULL
        ) THEN RAISE EXCEPTION 'Unexpected index definition: %',expected.index_name; END IF;
    END LOOP;
END $indexes$;
DROP INDEX attendance.idx_workout_sets_session_id;
CREATE INDEX idx_workout_sets_session_id ON attendance.workout_sets(session_id,user_id);
DROP INDEX attendance.idx_workout_sets_exercise_id;
CREATE INDEX idx_workout_sets_exercise_id ON attendance.workout_sets(exercise_id,user_id);
DROP INDEX attendance.exercise_item_subareas_subarea_idx;
CREATE INDEX exercise_item_subareas_subarea_idx ON attendance.exercise_item_subareas(subarea_id,target_area);
DROP INDEX attendance.shared_exercise_item_subareas_subarea_idx;
CREATE INDEX shared_exercise_item_subareas_subarea_idx ON attendance.shared_exercise_item_subareas(subarea_id,target_area);
CREATE INDEX exercise_item_subareas_exercise_area_idx ON attendance.exercise_item_subareas(exercise_id,target_area);
CREATE INDEX shared_exercise_item_subareas_exercise_area_idx ON attendance.shared_exercise_item_subareas(exercise_id,target_area);

-- Backward-compatible inserts: old clients omit these new context columns.
CREATE FUNCTION attendance.fill_reference_context() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, attendance AS $function$
BEGIN
    IF TG_TABLE_NAME = 'workout_sets' THEN
        IF NEW.user_id IS NULL THEN
            SELECT w.user_id INTO NEW.user_id FROM attendance.workout_sessions w WHERE w.session_id=NEW.session_id;
        END IF;
    ELSIF TG_TABLE_NAME = 'exercise_item_subareas' THEN
        IF NEW.target_area IS NULL THEN
            SELECT e.target_area INTO NEW.target_area FROM attendance.exercise_items e WHERE e.exercise_id=NEW.exercise_id;
        END IF;
    ELSIF TG_TABLE_NAME = 'shared_exercise_item_subareas' THEN
        IF NEW.target_area IS NULL THEN
            SELECT e.target_area INTO NEW.target_area FROM attendance.shared_exercise_items e WHERE e.exercise_id=NEW.exercise_id;
        END IF;
    END IF;
    RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION attendance.fill_reference_context() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION attendance.fill_reference_context() TO attendance_api;
CREATE TRIGGER workout_sets_fill_context BEFORE INSERT OR UPDATE OF session_id,user_id ON attendance.workout_sets
    FOR EACH ROW EXECUTE FUNCTION attendance.fill_reference_context();
CREATE TRIGGER exercise_item_subareas_fill_context BEFORE INSERT OR UPDATE OF exercise_id,target_area ON attendance.exercise_item_subareas
    FOR EACH ROW EXECUTE FUNCTION attendance.fill_reference_context();
CREATE TRIGGER shared_exercise_item_subareas_fill_context BEFORE INSERT OR UPDATE OF exercise_id,target_area ON attendance.shared_exercise_item_subareas
    FOR EACH ROW EXECUTE FUNCTION attendance.fill_reference_context();
