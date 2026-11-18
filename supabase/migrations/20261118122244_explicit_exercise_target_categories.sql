SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- All atlas targets have a selectable parent, including forearms and neck.
-- Existing exercises and target references remain unchanged.
ALTER TABLE attendance.exercise_items
    DROP CONSTRAINT ck_exercise_items_target_area,
    ADD CONSTRAINT ck_exercise_items_target_area CHECK (
        target_area IS NULL OR target_area IN (
            '가슴', '등', '어깨', '이두', '삼두', '전완', '목', '복근',
            '엉덩이', '허벅지', '종아리', '전신'
        )
    );

ALTER TABLE attendance.shared_exercise_items
    DROP CONSTRAINT ck_shared_exercise_items_target_area,
    ADD CONSTRAINT ck_shared_exercise_items_target_area CHECK (
        target_area IN (
            '가슴', '등', '어깨', '이두', '삼두', '전완', '목', '복근',
            '엉덩이', '허벅지', '종아리', '전신'
        )
    );
