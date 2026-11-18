SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

-- Undo only the twelve catalog entries added by back_exercise_variants.
-- Block concurrent references and refuse to remove any saved user data.
LOCK TABLE attendance.shared_exercise_items, attendance.workout_sets,
    attendance.user_shared_exercise_progress, attendance.exercise_research_records
    IN SHARE ROW EXCLUSIVE MODE;

DO $revert_back_variants$
DECLARE
    added_names CONSTANT TEXT[] := ARRAY[
        '하이 로우 (상부 등 중심)',
        '하이 로우 (광배근 중심)',
        '시티드 로우 (와이드 그립 · 팔꿈치 벌림)',
        '시티드 로우 (뉴트럴 그립 · 팔꿈치 붙임)',
        '시티드 로우 (언더 그립 · 팔꿈치 붙임)',
        '머신 로우 (와이드 그립 · 팔꿈치 벌림)',
        '머신 로우 (뉴트럴 그립 · 팔꿈치 붙임)',
        '머신 로우 (언더 그립 · 팔꿈치 붙임)',
        'T바 로우 (와이드 그립 · 팔꿈치 벌림)',
        'T바 로우 (뉴트럴 그립 · 팔꿈치 붙임)',
        '체스트 서포티드 로우 (팔꿈치 벌림)',
        '체스트 서포티드 로우 (팔꿈치 붙임)'
    ];
BEGIN
    IF EXISTS (
        SELECT 1 FROM attendance.workout_sets AS saved_set
        JOIN attendance.shared_exercise_items AS exercise
            ON exercise.exercise_id = saved_set.shared_exercise_id
        WHERE exercise.name = ANY(added_names) AND exercise.target_area = '등'
    ) OR EXISTS (
        SELECT 1 FROM attendance.user_shared_exercise_progress AS saved_progress
        JOIN attendance.shared_exercise_items AS exercise
            ON exercise.exercise_id = saved_progress.shared_exercise_id
        WHERE exercise.name = ANY(added_names) AND exercise.target_area = '등'
    ) OR EXISTS (
        SELECT 1 FROM attendance.exercise_research_records AS saved_research
        JOIN attendance.shared_exercise_items AS exercise
            ON exercise.exercise_id = saved_research.shared_exercise_id
        WHERE exercise.name = ANY(added_names) AND exercise.target_area = '등'
    ) THEN
        RAISE EXCEPTION 'Back variants are referenced by saved records; preserve those records before removing the variants.';
    END IF;

    DELETE FROM attendance.shared_exercise_items
    WHERE name = ANY(added_names) AND target_area = '등';
END;
$revert_back_variants$;
