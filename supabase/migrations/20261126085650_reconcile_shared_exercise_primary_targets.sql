SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

-- Normalize 43 shared defaults to the current training target IDs.
-- Correct eight representative target selections within their existing parent area.
-- Exercise IDs, workout sets and personal exercises are preserved.
-- Preserve the deprecated scalar backup: its legacy trigger would replace current junctions.
-- References:
-- NSCA: https://www.nsca.com/contentassets/24f7e187e9aa4a588439c9612231c7fd/tsac-module-3.0--3.3.pdf (page 19)
-- NASM: https://www.nasm.org/resource-center/exercise-library/plank
-- ACE: https://www.acefitness.org/resources/pros/expert-articles/8989/crunch-time-an-evidence-based-approach-to-training-the-abs/
-- NASM: https://www.nasm.org/resource-center/blog/training/calf-training-how-to-program-this-stubborn-muscle-group-for-clients
DO $reconcile_shared_targets$

DECLARE
    requested_catalog CONSTANT jsonb := $exercise_target_catalog$
[
  {
    "name": "벤치프레스",
    "target_area": "가슴",
    "previous_target_subarea": "대흉근",
    "target_subarea": "대흉근",
    "previous_subarea_ids": [
      "legacy_19b43f0351f31cb5f46cec020283623a"
    ],
    "subarea_ids": [
      "training_chest_all"
    ]
  },
  {
    "name": "인클라인 벤치프레스",
    "target_area": "가슴",
    "previous_target_subarea": "윗가슴",
    "target_subarea": "윗가슴",
    "previous_subarea_ids": [
      "legacy_85076ba2128783a70863e7c6d643f91a"
    ],
    "subarea_ids": [
      "training_chest_upper"
    ]
  },
  {
    "name": "덤벨 벤치프레스",
    "target_area": "가슴",
    "previous_target_subarea": "대흉근",
    "target_subarea": "대흉근",
    "previous_subarea_ids": [
      "legacy_19b43f0351f31cb5f46cec020283623a"
    ],
    "subarea_ids": [
      "training_chest_all"
    ]
  },
  {
    "name": "체스트 프레스",
    "target_area": "가슴",
    "previous_target_subarea": "대흉근",
    "target_subarea": "대흉근",
    "previous_subarea_ids": [
      "legacy_19b43f0351f31cb5f46cec020283623a"
    ],
    "subarea_ids": [
      "training_chest_all"
    ]
  },
  {
    "name": "푸시업",
    "target_area": "가슴",
    "previous_target_subarea": "대흉근",
    "target_subarea": "대흉근",
    "previous_subarea_ids": [
      "legacy_19b43f0351f31cb5f46cec020283623a"
    ],
    "subarea_ids": [
      "training_chest_all"
    ]
  },
  {
    "name": "스쿼트",
    "target_area": "허벅지",
    "previous_target_subarea": "대퇴사두근",
    "target_subarea": "대퇴사두근",
    "previous_subarea_ids": [
      "legacy_4386c65623e665c879f8bc8a35eefdaf"
    ],
    "subarea_ids": [
      "training_thigh_front"
    ]
  },
  {
    "name": "핵스쿼트",
    "target_area": "허벅지",
    "previous_target_subarea": "대퇴사두근",
    "target_subarea": "대퇴사두근",
    "previous_subarea_ids": [
      "legacy_4386c65623e665c879f8bc8a35eefdaf"
    ],
    "subarea_ids": [
      "training_thigh_front"
    ]
  },
  {
    "name": "레그 프레스",
    "target_area": "허벅지",
    "previous_target_subarea": "대퇴사두근",
    "target_subarea": "대퇴사두근",
    "previous_subarea_ids": [
      "legacy_4386c65623e665c879f8bc8a35eefdaf"
    ],
    "subarea_ids": [
      "training_thigh_front"
    ]
  },
  {
    "name": "런지",
    "target_area": "허벅지",
    "previous_target_subarea": "대퇴사두근",
    "target_subarea": "대퇴사두근",
    "previous_subarea_ids": [
      "legacy_4386c65623e665c879f8bc8a35eefdaf"
    ],
    "subarea_ids": [
      "training_thigh_front"
    ]
  },
  {
    "name": "레그 익스텐션",
    "target_area": "허벅지",
    "previous_target_subarea": "대퇴사두근",
    "target_subarea": "대퇴사두근",
    "previous_subarea_ids": [
      "legacy_4386c65623e665c879f8bc8a35eefdaf"
    ],
    "subarea_ids": [
      "training_thigh_front"
    ]
  },
  {
    "name": "레그 컬",
    "target_area": "허벅지",
    "previous_target_subarea": "햄스트링",
    "target_subarea": "햄스트링",
    "previous_subarea_ids": [
      "legacy_1f1f47e91cf43ce2e1503dc2b430f870"
    ],
    "subarea_ids": [
      "training_thigh_rear"
    ]
  },
  {
    "name": "카프 레이즈",
    "target_area": "종아리",
    "previous_target_subarea": "비복근",
    "target_subarea": "비복근",
    "previous_subarea_ids": [
      "legacy_d502b981b707a2685dec8a16de75b162"
    ],
    "subarea_ids": [
      "training_calf_gastrocnemius",
      "training_calf_soleus"
    ]
  },
  {
    "name": "데드리프트",
    "target_area": "등",
    "previous_target_subarea": "척추기립근",
    "target_subarea": "척추기립근",
    "previous_subarea_ids": [
      "legacy_ea9be4fa4545aca65ff9c61aabc80171"
    ],
    "subarea_ids": [
      "training_back_erectors"
    ]
  },
  {
    "name": "루마니안 데드리프트",
    "target_area": "허벅지",
    "previous_target_subarea": "햄스트링",
    "target_subarea": "햄스트링",
    "previous_subarea_ids": [
      "legacy_1f1f47e91cf43ce2e1503dc2b430f870"
    ],
    "subarea_ids": [
      "training_thigh_rear"
    ]
  },
  {
    "name": "랫 풀다운",
    "target_area": "등",
    "previous_target_subarea": "광배근",
    "target_subarea": "광배근",
    "previous_subarea_ids": [
      "legacy_85714abbb8fef906e72ddaeaa21219e8"
    ],
    "subarea_ids": [
      "training_back_lats"
    ]
  },
  {
    "name": "풀업",
    "target_area": "등",
    "previous_target_subarea": "광배근",
    "target_subarea": "광배근",
    "previous_subarea_ids": [
      "legacy_85714abbb8fef906e72ddaeaa21219e8"
    ],
    "subarea_ids": [
      "training_back_lats"
    ]
  },
  {
    "name": "시티드 로우",
    "target_area": "등",
    "previous_target_subarea": "광배근",
    "target_subarea": "광배근",
    "previous_subarea_ids": [
      "legacy_85714abbb8fef906e72ddaeaa21219e8"
    ],
    "subarea_ids": [
      "training_back_lats",
      "training_back_rhomboids",
      "training_back_traps_middle"
    ]
  },
  {
    "name": "바벨 로우",
    "target_area": "등",
    "previous_target_subarea": "광배근",
    "target_subarea": "광배근",
    "previous_subarea_ids": [
      "legacy_85714abbb8fef906e72ddaeaa21219e8"
    ],
    "subarea_ids": [
      "training_back_lats",
      "training_back_rhomboids",
      "training_back_traps_middle"
    ]
  },
  {
    "name": "숄더 프레스",
    "target_area": "어깨",
    "previous_target_subarea": "전면 삼각근",
    "target_subarea": "전면 삼각근",
    "previous_subarea_ids": [
      "legacy_ad82e31631dc50bb932dd4482fd5a707"
    ],
    "subarea_ids": [
      "training_shoulder_front",
      "training_shoulder_side"
    ]
  },
  {
    "name": "사이드 레터럴 레이즈",
    "target_area": "어깨",
    "previous_target_subarea": "측면 삼각근",
    "target_subarea": "측면 삼각근",
    "previous_subarea_ids": [
      "legacy_872e112e13904a57bdebf1af19803918"
    ],
    "subarea_ids": [
      "training_shoulder_side"
    ]
  },
  {
    "name": "리어 델트 플라이",
    "target_area": "어깨",
    "previous_target_subarea": "후면 삼각근",
    "target_subarea": "후면 삼각근",
    "previous_subarea_ids": [
      "legacy_d480f24ae655147a2bba90de46f7ad77"
    ],
    "subarea_ids": [
      "training_shoulder_rear"
    ]
  },
  {
    "name": "바벨 컬",
    "target_area": "이두",
    "previous_target_subarea": "상완이두근",
    "target_subarea": "상완이두근",
    "previous_subarea_ids": [
      "legacy_587bb58b4112909459de05ace1aa6d2a"
    ],
    "subarea_ids": [
      "training_biceps"
    ]
  },
  {
    "name": "덤벨 컬",
    "target_area": "이두",
    "previous_target_subarea": "상완이두근",
    "target_subarea": "상완이두근",
    "previous_subarea_ids": [
      "legacy_587bb58b4112909459de05ace1aa6d2a"
    ],
    "subarea_ids": [
      "training_biceps"
    ]
  },
  {
    "name": "트라이셉스 푸시다운",
    "target_area": "삼두",
    "previous_target_subarea": "상완삼두근",
    "target_subarea": "상완삼두근",
    "previous_subarea_ids": [
      "legacy_62526cd7d6ff58ea7f967b1a115720d1"
    ],
    "subarea_ids": [
      "training_triceps"
    ]
  },
  {
    "name": "플랭크",
    "target_area": "복근",
    "previous_target_subarea": "복횡근",
    "target_subarea": "복횡근",
    "previous_subarea_ids": [
      "legacy_394fb5eaaea902767d6e41b74c291faf"
    ],
    "subarea_ids": [
      "training_abs_front",
      "training_abs_transverse"
    ]
  },
  {
    "name": "크런치",
    "target_area": "복근",
    "previous_target_subarea": "상복부",
    "target_subarea": "상복부",
    "previous_subarea_ids": [
      "legacy_3d79906a35f0c056bb120a410c14aa99"
    ],
    "subarea_ids": [
      "training_abs_front"
    ]
  },
  {
    "name": "딥스",
    "target_area": "삼두",
    "previous_target_subarea": "상완삼두근",
    "target_subarea": "상완삼두근",
    "previous_subarea_ids": [
      "legacy_62526cd7d6ff58ea7f967b1a115720d1"
    ],
    "subarea_ids": [
      "training_triceps"
    ]
  },
  {
    "name": "펙 덱 플라이",
    "target_area": "가슴",
    "previous_target_subarea": "대흉근",
    "target_subarea": "대흉근",
    "previous_subarea_ids": [
      "legacy_19b43f0351f31cb5f46cec020283623a"
    ],
    "subarea_ids": [
      "training_chest_all"
    ]
  },
  {
    "name": "암 풀다운",
    "target_area": "등",
    "previous_target_subarea": "광배근",
    "target_subarea": "광배근",
    "previous_subarea_ids": [
      "legacy_85714abbb8fef906e72ddaeaa21219e8"
    ],
    "subarea_ids": [
      "training_back_lats"
    ]
  },
  {
    "name": "하이 로우",
    "target_area": "등",
    "previous_target_subarea": "광배근",
    "target_subarea": "광배근",
    "previous_subarea_ids": [
      "legacy_85714abbb8fef906e72ddaeaa21219e8"
    ],
    "subarea_ids": [
      "training_back_lats"
    ]
  },
  {
    "name": "오버헤드 프레스",
    "target_area": "어깨",
    "previous_target_subarea": "전면 삼각근",
    "target_subarea": "전면 삼각근",
    "previous_subarea_ids": [
      "legacy_ad82e31631dc50bb932dd4482fd5a707"
    ],
    "subarea_ids": [
      "training_shoulder_front",
      "training_shoulder_side"
    ]
  },
  {
    "name": "브이 스쿼트",
    "target_area": "허벅지",
    "previous_target_subarea": "대퇴사두근",
    "target_subarea": "대퇴사두근",
    "previous_subarea_ids": [
      "legacy_4386c65623e665c879f8bc8a35eefdaf"
    ],
    "subarea_ids": [
      "training_thigh_front"
    ]
  },
  {
    "name": "시티드 레그 컬",
    "target_area": "허벅지",
    "previous_target_subarea": "햄스트링",
    "target_subarea": "햄스트링",
    "previous_subarea_ids": [
      "legacy_1f1f47e91cf43ce2e1503dc2b430f870"
    ],
    "subarea_ids": [
      "training_thigh_rear"
    ]
  },
  {
    "name": "불가리안 스플릿 스쿼트",
    "target_area": "허벅지",
    "previous_target_subarea": "대퇴사두근",
    "target_subarea": "대퇴사두근",
    "previous_subarea_ids": [
      "legacy_4386c65623e665c879f8bc8a35eefdaf"
    ],
    "subarea_ids": [
      "training_thigh_front"
    ]
  },
  {
    "name": "사이드 크런치",
    "target_area": "복근",
    "previous_target_subarea": "복사근",
    "target_subarea": "복사근",
    "previous_subarea_ids": [
      "legacy_f33c204bfbfcb787419f964641457268"
    ],
    "subarea_ids": [
      "training_abs_side"
    ]
  },
  {
    "name": "디클라인 프레스",
    "target_area": "가슴",
    "previous_target_subarea": "아랫가슴",
    "target_subarea": "아랫가슴",
    "previous_subarea_ids": [
      "legacy_2481795132c1cd5a1ed41558eb58d803"
    ],
    "subarea_ids": [
      "training_chest_lower"
    ]
  },
  {
    "name": "인클라인 프레스",
    "target_area": "가슴",
    "previous_target_subarea": "윗가슴",
    "target_subarea": "윗가슴",
    "previous_subarea_ids": [
      "legacy_85076ba2128783a70863e7c6d643f91a"
    ],
    "subarea_ids": [
      "training_chest_upper"
    ]
  },
  {
    "name": "T바 로우",
    "target_area": "등",
    "previous_target_subarea": "광배근",
    "target_subarea": "광배근",
    "previous_subarea_ids": [
      "legacy_85714abbb8fef906e72ddaeaa21219e8"
    ],
    "subarea_ids": [
      "training_back_lats",
      "training_back_rhomboids",
      "training_back_traps_middle"
    ]
  },
  {
    "name": "페이스 풀",
    "target_area": "어깨",
    "previous_target_subarea": "후면 삼각근",
    "target_subarea": "후면 삼각근",
    "previous_subarea_ids": [
      "legacy_d480f24ae655147a2bba90de46f7ad77"
    ],
    "subarea_ids": [
      "training_shoulder_rear"
    ]
  },
  {
    "name": "펜듈럼 스쿼트",
    "target_area": "허벅지",
    "previous_target_subarea": "대퇴사두근",
    "target_subarea": "대퇴사두근",
    "previous_subarea_ids": [
      "legacy_4386c65623e665c879f8bc8a35eefdaf"
    ],
    "subarea_ids": [
      "training_thigh_front"
    ]
  },
  {
    "name": "헤머 컬",
    "target_area": "이두",
    "previous_target_subarea": "상완근",
    "target_subarea": "상완근",
    "previous_subarea_ids": [
      "legacy_40430c0603b063210524f02f23976a1b"
    ],
    "subarea_ids": [
      "training_biceps_brachialis"
    ]
  },
  {
    "name": "컨센트레이션 컬",
    "target_area": "이두",
    "previous_target_subarea": "상완이두근",
    "target_subarea": "상완이두근",
    "previous_subarea_ids": [
      "legacy_587bb58b4112909459de05ace1aa6d2a"
    ],
    "subarea_ids": [
      "training_biceps"
    ]
  },
  {
    "name": "프리쳐 컬",
    "target_area": "이두",
    "previous_target_subarea": "상완이두근",
    "target_subarea": "상완이두근",
    "previous_subarea_ids": [
      "legacy_587bb58b4112909459de05ace1aa6d2a"
    ],
    "subarea_ids": [
      "training_biceps"
    ]
  }
]
$exercise_target_catalog$::jsonb;
    requested record;
    stored_exercise record;
    stored_target_ids jsonb;
    workout_checksum_before text;
    workout_checksum_after text;
    matched_exercise_count integer := 0;
BEGIN
    SELECT md5(COALESCE(string_agg(md5(to_jsonb(saved_set)::text), '' ORDER BY saved_set.set_id), ''))
    INTO workout_checksum_before
    FROM attendance.workout_sets AS saved_set;

    FOR requested IN
        SELECT * FROM jsonb_to_recordset(requested_catalog) AS catalog(name text, target_area text, previous_target_subarea text,
            target_subarea text, previous_subarea_ids jsonb, subarea_ids jsonb)
    LOOP
        SELECT exercise_id, target_area, target_subarea
        INTO stored_exercise
        FROM attendance.shared_exercise_items
        WHERE name = requested.name
        FOR UPDATE;
        IF NOT FOUND OR stored_exercise.target_area IS DISTINCT FROM requested.target_area THEN
            RAISE EXCEPTION 'Shared exercise missing or parent area changed: %', requested.name;
        END IF;

        SELECT COALESCE(jsonb_agg(subarea_id ORDER BY subarea_id), '[]'::jsonb)
        INTO stored_target_ids
        FROM attendance.shared_exercise_item_subareas
        WHERE exercise_id = stored_exercise.exercise_id;
        IF NOT (
            (stored_target_ids = requested.previous_subarea_ids
             AND stored_exercise.target_subarea IS NOT DISTINCT FROM requested.previous_target_subarea)
            OR
            (stored_target_ids = requested.subarea_ids
             AND stored_exercise.target_subarea IS NOT DISTINCT FROM requested.target_subarea)
        ) THEN
            RAISE EXCEPTION 'Shared target selection changed after review: %', requested.name;
        END IF;
        IF jsonb_array_length(requested.previous_subarea_ids) <> 1
            OR jsonb_array_length(requested.subarea_ids) < 1
            OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(requested.subarea_ids) AS desired(subarea_id)
                LEFT JOIN attendance.exercise_subareas AS target USING (subarea_id)
                WHERE target.subarea_id IS NULL
                   OR target.target_area IS DISTINCT FROM requested.target_area
                   OR target.body_group IS DISTINCT FROM 'training'
            )
        THEN
            RAISE EXCEPTION 'Missing or invalid canonical training target: %', requested.name;
        END IF;

        -- Replace the old link in place; add only the reviewed missing targets.
        UPDATE attendance.shared_exercise_item_subareas
        SET subarea_id = requested.subarea_ids ->> 0
        WHERE exercise_id = stored_exercise.exercise_id
          AND subarea_id = requested.previous_subarea_ids ->> 0;

        INSERT INTO attendance.shared_exercise_item_subareas (exercise_id, subarea_id, target_area)
        SELECT stored_exercise.exercise_id, desired.subarea_id, requested.target_area
        FROM jsonb_array_elements_text(requested.subarea_ids) AS desired(subarea_id)
        ON CONFLICT (exercise_id, subarea_id) DO NOTHING;

        SELECT COALESCE(jsonb_agg(subarea_id ORDER BY subarea_id), '[]'::jsonb)
        INTO stored_target_ids
        FROM attendance.shared_exercise_item_subareas
        WHERE exercise_id = stored_exercise.exercise_id;
        IF stored_target_ids IS DISTINCT FROM requested.subarea_ids THEN
            RAISE EXCEPTION 'Shared target postcondition failed: %', requested.name;
        END IF;
        matched_exercise_count := matched_exercise_count + 1;
    END LOOP;
    IF matched_exercise_count <> 43 THEN
        RAISE EXCEPTION 'Expected 43 reviewed shared exercises, got %', matched_exercise_count;
    END IF;
    SELECT md5(COALESCE(string_agg(md5(to_jsonb(saved_set)::text), '' ORDER BY saved_set.set_id), ''))
    INTO workout_checksum_after
    FROM attendance.workout_sets AS saved_set;
    IF workout_checksum_after IS DISTINCT FROM workout_checksum_before THEN
        RAISE EXCEPTION 'Workout sets changed during shared target reconciliation';
    END IF;
END
$reconcile_shared_targets$;
