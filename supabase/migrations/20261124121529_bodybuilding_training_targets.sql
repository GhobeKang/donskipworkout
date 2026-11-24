SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Add bodybuilding targets. Preserve existing references, exercise links and sets.
-- Old clients hide these rows; current clients use source catalog metadata.
INSERT INTO attendance.exercise_subareas (subarea_id, target_area, label_ko, label_en, body_group, side, views, atlas_muscle_ids, is_legacy, sort_order)
SELECT subarea_id, target_area, label_ko, label_en, body_group, side, views, atlas_muscle_ids, is_legacy, sort_order
FROM jsonb_to_recordset($training_catalog$
[
  {
    "subarea_id": "training_chest_all",
    "target_area": "가슴",
    "label_ko": "가슴 전체",
    "label_en": "Whole chest",
    "body_group": "training",
    "side": "center",
    "views": [
      "front"
    ],
    "atlas_muscle_ids": [
      "pectoralis_major_l",
      "pectoralis_major_r"
    ],
    "is_legacy": true,
    "sort_order": 1000
  },
  {
    "subarea_id": "training_chest_upper",
    "target_area": "가슴",
    "label_ko": "상부 가슴",
    "label_en": "Upper chest",
    "body_group": "training",
    "side": "center",
    "views": [
      "front"
    ],
    "atlas_muscle_ids": [
      "pectoralis_major_l",
      "pectoralis_major_r"
    ],
    "is_legacy": true,
    "sort_order": 1001
  },
  {
    "subarea_id": "training_chest_middle",
    "target_area": "가슴",
    "label_ko": "중부 가슴",
    "label_en": "Middle chest",
    "body_group": "training",
    "side": "center",
    "views": [
      "front"
    ],
    "atlas_muscle_ids": [
      "pectoralis_major_l",
      "pectoralis_major_r"
    ],
    "is_legacy": true,
    "sort_order": 1002
  },
  {
    "subarea_id": "training_chest_lower",
    "target_area": "가슴",
    "label_ko": "하부 가슴",
    "label_en": "Lower chest",
    "body_group": "training",
    "side": "center",
    "views": [
      "front"
    ],
    "atlas_muscle_ids": [
      "pectoralis_major_l",
      "pectoralis_major_r"
    ],
    "is_legacy": true,
    "sort_order": 1003
  },
  {
    "subarea_id": "training_back_lats",
    "target_area": "등",
    "label_ko": "광배근 전체",
    "label_en": "Latissimus dorsi overall",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "latissimus_dorsi_r",
      "latissimus_dorsi_l"
    ],
    "is_legacy": true,
    "sort_order": 1004
  },
  {
    "subarea_id": "training_back_upper",
    "target_area": "등",
    "label_ko": "등 상부·중부 전체",
    "label_en": "Upper and middle back overall",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "trapezius_upper_r",
      "trapezius_upper_l",
      "trapezius_middle_r",
      "trapezius_middle_l",
      "trapezius_lower_r",
      "trapezius_lower_l"
    ],
    "is_legacy": true,
    "sort_order": 1005
  },
  {
    "subarea_id": "training_back_lower",
    "target_area": "등",
    "label_ko": "등 하부 전체",
    "label_en": "Lower back overall",
    "body_group": "training",
    "side": "center",
    "views": [],
    "atlas_muscle_ids": [],
    "is_legacy": true,
    "sort_order": 1006
  },
  {
    "subarea_id": "training_shoulder_front",
    "target_area": "어깨",
    "label_ko": "전면 어깨",
    "label_en": "Front shoulders",
    "body_group": "training",
    "side": "center",
    "views": [
      "front"
    ],
    "atlas_muscle_ids": [
      "anterior_deltoid_l",
      "anterior_deltoid_r"
    ],
    "is_legacy": true,
    "sort_order": 1007
  },
  {
    "subarea_id": "training_shoulder_side",
    "target_area": "어깨",
    "label_ko": "측면 어깨",
    "label_en": "Side shoulders",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "lateral_deltoid_r",
      "lateral_deltoid_l"
    ],
    "is_legacy": true,
    "sort_order": 1008
  },
  {
    "subarea_id": "training_shoulder_rear",
    "target_area": "어깨",
    "label_ko": "후면 어깨",
    "label_en": "Rear shoulders",
    "body_group": "training",
    "side": "center",
    "views": [
      "back"
    ],
    "atlas_muscle_ids": [
      "posterior_deltoid_r",
      "posterior_deltoid_l"
    ],
    "is_legacy": true,
    "sort_order": 1009
  },
  {
    "subarea_id": "training_shoulder_stability",
    "target_area": "어깨",
    "label_ko": "어깨 안정화",
    "label_en": "Shoulder stability",
    "body_group": "training",
    "side": "center",
    "views": [
      "back"
    ],
    "atlas_muscle_ids": [
      "infraspinatus_r",
      "infraspinatus_l"
    ],
    "is_legacy": true,
    "sort_order": 1010
  },
  {
    "subarea_id": "training_biceps",
    "target_area": "이두",
    "label_ko": "이두 전체",
    "label_en": "Biceps overall",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "biceps_brachii_caput_breve_l",
      "biceps_brachii_caput_breve_r",
      "biceps_brachii_caput_longum_l",
      "biceps_brachii_caput_longum_r"
    ],
    "is_legacy": true,
    "sort_order": 1011
  },
  {
    "subarea_id": "training_triceps",
    "target_area": "삼두",
    "label_ko": "삼두 전체",
    "label_en": "Triceps overall",
    "body_group": "training",
    "side": "center",
    "views": [
      "back",
      "front"
    ],
    "atlas_muscle_ids": [
      "triceps_brachii_caput_laterale_r",
      "triceps_brachii_caput_laterale_l",
      "triceps_brachii_caput_longum_r",
      "triceps_brachii_caput_longum_l",
      "triceps_brachii_caput_mediale_r",
      "triceps_brachii_caput_mediale_l"
    ],
    "is_legacy": true,
    "sort_order": 1012
  },
  {
    "subarea_id": "training_forearms",
    "target_area": "전완",
    "label_ko": "전완 전체",
    "label_en": "Forearms overall",
    "body_group": "training",
    "side": "center",
    "views": [
      "back",
      "front"
    ],
    "atlas_muscle_ids": [
      "extensor_digitorum_r",
      "extensor_digitorum_l",
      "extensor_carpi_ulnaris_r",
      "extensor_carpi_ulnaris_l",
      "flexor_carpi_ulnaris_r",
      "flexor_carpi_ulnaris_l",
      "flexor_digitorum_superficialis_l",
      "flexor_digitorum_superficialis_r",
      "pronator_quadratus_l",
      "pronator_quadratus_r",
      "extensor_carpi_radialis_longus_l",
      "extensor_carpi_radialis_longus_r",
      "palmaris_longus_l",
      "palmaris_longus_r",
      "flexor_carpi_radialis_l",
      "flexor_carpi_radialis_r",
      "pronator_teres_l",
      "pronator_teres_r"
    ],
    "is_legacy": true,
    "sort_order": 1013
  },
  {
    "subarea_id": "training_neck",
    "target_area": "목",
    "label_ko": "목",
    "label_en": "Neck",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "sternocleidomastoid_r",
      "sternocleidomastoid_l",
      "platysma",
      "sternohyoid"
    ],
    "is_legacy": true,
    "sort_order": 1014
  },
  {
    "subarea_id": "training_abs_front",
    "target_area": "복근",
    "label_ko": "복직근 전체",
    "label_en": "Rectus abdominis overall",
    "body_group": "training",
    "side": "center",
    "views": [
      "front"
    ],
    "atlas_muscle_ids": [
      "rectus_abdominis_1",
      "rectus_abdominis_2_l",
      "rectus_abdominis_2_r",
      "rectus_abdominis_3_l",
      "rectus_abdominis_3_r",
      "rectus_abdominis_4_l",
      "rectus_abdominis_4_r"
    ],
    "is_legacy": true,
    "sort_order": 1015
  },
  {
    "subarea_id": "training_abs_side",
    "target_area": "복근",
    "label_ko": "복사근 전체",
    "label_en": "Obliques overall",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "external_oblique_1_l",
      "external_oblique_2_l",
      "external_oblique_3_l",
      "external_oblique_4_l",
      "external_oblique_5_l",
      "external_oblique_6_l",
      "external_oblique_7_l",
      "external_oblique_8_l",
      "external_oblique_1_r",
      "external_oblique_2_r",
      "external_oblique_3_r",
      "external_oblique_4_r",
      "external_oblique_5_r",
      "external_oblique_6_r",
      "external_oblique_7_r",
      "external_oblique_8_r"
    ],
    "is_legacy": true,
    "sort_order": 1016
  },
  {
    "subarea_id": "training_core_stability",
    "target_area": "복근",
    "label_ko": "코어 안정화",
    "label_en": "Core stability",
    "body_group": "training",
    "side": "center",
    "views": [],
    "atlas_muscle_ids": [],
    "is_legacy": true,
    "sort_order": 1017
  },
  {
    "subarea_id": "training_glutes",
    "target_area": "엉덩이",
    "label_ko": "둔근",
    "label_en": "Glutes",
    "body_group": "training",
    "side": "center",
    "views": [
      "back",
      "front"
    ],
    "atlas_muscle_ids": [
      "gluteus_maximus_r",
      "gluteus_maximus_l",
      "gluteus_medius_2_r",
      "gluteus_medius_1_r",
      "gluteus_medius_2_l",
      "gluteus_medius_1_l"
    ],
    "is_legacy": true,
    "sort_order": 1018
  },
  {
    "subarea_id": "training_thigh_front",
    "target_area": "허벅지",
    "label_ko": "허벅지 앞쪽 전체",
    "label_en": "Front thigh overall",
    "body_group": "training",
    "side": "center",
    "views": [
      "front"
    ],
    "atlas_muscle_ids": [
      "vastus_lateralis_l",
      "vastus_lateralis_r",
      "vastus_medialis_l",
      "vastus_medialis_r",
      "rectus_femoris_l",
      "rectus_femoris_r"
    ],
    "is_legacy": true,
    "sort_order": 1019
  },
  {
    "subarea_id": "training_thigh_rear",
    "target_area": "허벅지",
    "label_ko": "햄스트링 전체",
    "label_en": "Hamstrings overall",
    "body_group": "training",
    "side": "center",
    "views": [
      "back",
      "front"
    ],
    "atlas_muscle_ids": [
      "semimembranosus_2_r",
      "semimembranosus_1_r",
      "semimembranosus_2_l",
      "semimembranosus_1_l",
      "semitendinosus_r",
      "semitendinosus_l",
      "biceps_femoris_r",
      "biceps_femoris_l"
    ],
    "is_legacy": true,
    "sort_order": 1020
  },
  {
    "subarea_id": "training_thigh_inner",
    "target_area": "허벅지",
    "label_ko": "내전근",
    "label_en": "Adductors",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "gracilis_l",
      "gracilis_r",
      "adductor_magnus_l",
      "adductor_magnus_r",
      "adductor_longus_l",
      "adductor_longus_r",
      "pectineus_l",
      "pectineus_r"
    ],
    "is_legacy": true,
    "sort_order": 1021
  },
  {
    "subarea_id": "training_calves",
    "target_area": "종아리",
    "label_ko": "종아리 전체",
    "label_en": "Calves overall",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "gastrocnemius_r",
      "gastrocnemius_l",
      "fibularis_longus_l",
      "fibularis_longus_r"
    ],
    "is_legacy": true,
    "sort_order": 1022
  },
  {
    "subarea_id": "training_shins",
    "target_area": "종아리",
    "label_ko": "정강이",
    "label_en": "Shins",
    "body_group": "training",
    "side": "center",
    "views": [
      "front"
    ],
    "atlas_muscle_ids": [
      "tibialis_anterior_l",
      "tibialis_anterior_r",
      "extensor_hallucis_longus_l",
      "extensor_hallucis_longus_r",
      "extensor_digitorum_longus_l",
      "extensor_digitorum_longus_r"
    ],
    "is_legacy": true,
    "sort_order": 1023
  },
  {
    "subarea_id": "training_whole_upper",
    "target_area": "전신",
    "label_ko": "상체 중심",
    "label_en": "Upper-body focus",
    "body_group": "training",
    "side": "center",
    "views": [],
    "atlas_muscle_ids": [],
    "is_legacy": true,
    "sort_order": 1024
  },
  {
    "subarea_id": "training_whole_lower",
    "target_area": "전신",
    "label_ko": "하체 중심",
    "label_en": "Lower-body focus",
    "body_group": "training",
    "side": "center",
    "views": [],
    "atlas_muscle_ids": [],
    "is_legacy": true,
    "sort_order": 1025
  },
  {
    "subarea_id": "training_whole_core",
    "target_area": "전신",
    "label_ko": "코어 중심",
    "label_en": "Core focus",
    "body_group": "training",
    "side": "center",
    "views": [],
    "atlas_muscle_ids": [],
    "is_legacy": true,
    "sort_order": 1026
  },
  {
    "subarea_id": "training_back_lats_upper",
    "target_area": "등",
    "label_ko": "광배근 상부",
    "label_en": "Upper lat emphasis",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "latissimus_dorsi_r",
      "latissimus_dorsi_l"
    ],
    "is_legacy": true,
    "sort_order": 1027
  },
  {
    "subarea_id": "training_back_lats_lower",
    "target_area": "등",
    "label_ko": "광배근 하부",
    "label_en": "Lower lat emphasis",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "latissimus_dorsi_r",
      "latissimus_dorsi_l"
    ],
    "is_legacy": true,
    "sort_order": 1028
  },
  {
    "subarea_id": "training_back_traps_upper",
    "target_area": "등",
    "label_ko": "승모근 상부",
    "label_en": "Upper trapezius",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "trapezius_upper_r",
      "trapezius_upper_l"
    ],
    "is_legacy": true,
    "sort_order": 1029
  },
  {
    "subarea_id": "training_back_traps_middle",
    "target_area": "등",
    "label_ko": "승모근 중부",
    "label_en": "Middle trapezius",
    "body_group": "training",
    "side": "center",
    "views": [
      "back"
    ],
    "atlas_muscle_ids": [
      "trapezius_middle_r",
      "trapezius_middle_l"
    ],
    "is_legacy": true,
    "sort_order": 1030
  },
  {
    "subarea_id": "training_back_traps_lower",
    "target_area": "등",
    "label_ko": "승모근 하부",
    "label_en": "Lower trapezius",
    "body_group": "training",
    "side": "center",
    "views": [
      "back"
    ],
    "atlas_muscle_ids": [
      "trapezius_lower_r",
      "trapezius_lower_l"
    ],
    "is_legacy": true,
    "sort_order": 1031
  },
  {
    "subarea_id": "training_back_rhomboids",
    "target_area": "등",
    "label_ko": "능형근",
    "label_en": "Rhomboids",
    "body_group": "training",
    "side": "center",
    "views": [],
    "atlas_muscle_ids": [],
    "is_legacy": true,
    "sort_order": 1032
  },
  {
    "subarea_id": "training_back_teres",
    "target_area": "등",
    "label_ko": "대원근",
    "label_en": "Teres major",
    "body_group": "training",
    "side": "center",
    "views": [],
    "atlas_muscle_ids": [],
    "is_legacy": true,
    "sort_order": 1033
  },
  {
    "subarea_id": "training_back_erectors",
    "target_area": "등",
    "label_ko": "척추기립근",
    "label_en": "Erector spinae",
    "body_group": "training",
    "side": "center",
    "views": [],
    "atlas_muscle_ids": [],
    "is_legacy": true,
    "sort_order": 1034
  },
  {
    "subarea_id": "training_biceps_long",
    "target_area": "이두",
    "label_ko": "이두 장두",
    "label_en": "Biceps long head",
    "body_group": "training",
    "side": "center",
    "views": [
      "front"
    ],
    "atlas_muscle_ids": [
      "biceps_brachii_caput_longum_l",
      "biceps_brachii_caput_longum_r"
    ],
    "is_legacy": true,
    "sort_order": 1035
  },
  {
    "subarea_id": "training_biceps_short",
    "target_area": "이두",
    "label_ko": "이두 단두",
    "label_en": "Biceps short head",
    "body_group": "training",
    "side": "center",
    "views": [
      "front"
    ],
    "atlas_muscle_ids": [
      "biceps_brachii_caput_breve_l",
      "biceps_brachii_caput_breve_r"
    ],
    "is_legacy": true,
    "sort_order": 1036
  },
  {
    "subarea_id": "training_biceps_brachialis",
    "target_area": "이두",
    "label_ko": "상완근",
    "label_en": "Brachialis",
    "body_group": "training",
    "side": "center",
    "views": [],
    "atlas_muscle_ids": [],
    "is_legacy": true,
    "sort_order": 1037
  },
  {
    "subarea_id": "training_triceps_long",
    "target_area": "삼두",
    "label_ko": "삼두 장두",
    "label_en": "Triceps long head",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "triceps_brachii_caput_longum_r",
      "triceps_brachii_caput_longum_l"
    ],
    "is_legacy": true,
    "sort_order": 1038
  },
  {
    "subarea_id": "training_triceps_lateral",
    "target_area": "삼두",
    "label_ko": "삼두 외측두",
    "label_en": "Triceps lateral head",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "triceps_brachii_caput_laterale_r",
      "triceps_brachii_caput_laterale_l"
    ],
    "is_legacy": true,
    "sort_order": 1039
  },
  {
    "subarea_id": "training_triceps_medial",
    "target_area": "삼두",
    "label_ko": "삼두 내측두",
    "label_en": "Triceps medial head",
    "body_group": "training",
    "side": "center",
    "views": [
      "back"
    ],
    "atlas_muscle_ids": [
      "triceps_brachii_caput_mediale_r",
      "triceps_brachii_caput_mediale_l"
    ],
    "is_legacy": true,
    "sort_order": 1040
  },
  {
    "subarea_id": "training_forearm_flexors",
    "target_area": "전완",
    "label_ko": "전완 굴곡근",
    "label_en": "Forearm flexors",
    "body_group": "training",
    "side": "center",
    "views": [
      "back",
      "front"
    ],
    "atlas_muscle_ids": [
      "flexor_carpi_ulnaris_r",
      "flexor_carpi_ulnaris_l",
      "flexor_digitorum_superficialis_l",
      "flexor_digitorum_superficialis_r",
      "flexor_carpi_radialis_l",
      "flexor_carpi_radialis_r",
      "palmaris_longus_l",
      "palmaris_longus_r",
      "pronator_quadratus_l",
      "pronator_quadratus_r",
      "pronator_teres_l",
      "pronator_teres_r"
    ],
    "is_legacy": true,
    "sort_order": 1041
  },
  {
    "subarea_id": "training_forearm_extensors",
    "target_area": "전완",
    "label_ko": "전완 신전근",
    "label_en": "Forearm extensors",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "extensor_digitorum_longus_l",
      "extensor_digitorum_longus_r",
      "extensor_digitorum_r",
      "extensor_digitorum_l",
      "extensor_carpi_ulnaris_r",
      "extensor_carpi_ulnaris_l",
      "extensor_carpi_radialis_longus_l",
      "extensor_carpi_radialis_longus_r"
    ],
    "is_legacy": true,
    "sort_order": 1042
  },
  {
    "subarea_id": "training_forearm_brachioradialis",
    "target_area": "전완",
    "label_ko": "상완요골근",
    "label_en": "Brachioradialis",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "brachioradialis_r",
      "brachioradialis_l"
    ],
    "is_legacy": true,
    "sort_order": 1043
  },
  {
    "subarea_id": "training_abs_upper",
    "target_area": "복근",
    "label_ko": "상복부",
    "label_en": "Upper abs emphasis",
    "body_group": "training",
    "side": "center",
    "views": [
      "front"
    ],
    "atlas_muscle_ids": [
      "rectus_abdominis_1",
      "rectus_abdominis_2_l",
      "rectus_abdominis_2_r",
      "rectus_abdominis_3_l",
      "rectus_abdominis_3_r",
      "rectus_abdominis_4_l",
      "rectus_abdominis_4_r"
    ],
    "is_legacy": true,
    "sort_order": 1044
  },
  {
    "subarea_id": "training_abs_lower",
    "target_area": "복근",
    "label_ko": "하복부",
    "label_en": "Lower abs emphasis",
    "body_group": "training",
    "side": "center",
    "views": [
      "front"
    ],
    "atlas_muscle_ids": [
      "rectus_abdominis_1",
      "rectus_abdominis_2_l",
      "rectus_abdominis_2_r",
      "rectus_abdominis_3_l",
      "rectus_abdominis_3_r",
      "rectus_abdominis_4_l",
      "rectus_abdominis_4_r"
    ],
    "is_legacy": true,
    "sort_order": 1045
  },
  {
    "subarea_id": "training_abs_external_oblique",
    "target_area": "복근",
    "label_ko": "외복사근",
    "label_en": "External oblique",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "external_oblique_1_l",
      "external_oblique_2_l",
      "external_oblique_3_l",
      "external_oblique_4_l",
      "external_oblique_5_l",
      "external_oblique_6_l",
      "external_oblique_7_l",
      "external_oblique_8_l",
      "external_oblique_1_r",
      "external_oblique_2_r",
      "external_oblique_3_r",
      "external_oblique_4_r",
      "external_oblique_5_r",
      "external_oblique_6_r",
      "external_oblique_7_r",
      "external_oblique_8_r"
    ],
    "is_legacy": true,
    "sort_order": 1046
  },
  {
    "subarea_id": "training_abs_internal_oblique",
    "target_area": "복근",
    "label_ko": "내복사근",
    "label_en": "Internal oblique",
    "body_group": "training",
    "side": "center",
    "views": [],
    "atlas_muscle_ids": [],
    "is_legacy": true,
    "sort_order": 1047
  },
  {
    "subarea_id": "training_abs_transverse",
    "target_area": "복근",
    "label_ko": "복횡근",
    "label_en": "Transversus abdominis",
    "body_group": "training",
    "side": "center",
    "views": [],
    "atlas_muscle_ids": [],
    "is_legacy": true,
    "sort_order": 1048
  },
  {
    "subarea_id": "training_thigh_lateralis",
    "target_area": "허벅지",
    "label_ko": "외측광근",
    "label_en": "Vastus lateralis",
    "body_group": "training",
    "side": "center",
    "views": [
      "front"
    ],
    "atlas_muscle_ids": [
      "vastus_lateralis_l",
      "vastus_lateralis_r"
    ],
    "is_legacy": true,
    "sort_order": 1049
  },
  {
    "subarea_id": "training_thigh_medialis",
    "target_area": "허벅지",
    "label_ko": "내측광근",
    "label_en": "Vastus medialis",
    "body_group": "training",
    "side": "center",
    "views": [
      "front"
    ],
    "atlas_muscle_ids": [
      "vastus_medialis_l",
      "vastus_medialis_r"
    ],
    "is_legacy": true,
    "sort_order": 1050
  },
  {
    "subarea_id": "training_thigh_rectus",
    "target_area": "허벅지",
    "label_ko": "대퇴직근",
    "label_en": "Rectus femoris",
    "body_group": "training",
    "side": "center",
    "views": [
      "front"
    ],
    "atlas_muscle_ids": [
      "rectus_femoris_l",
      "rectus_femoris_r"
    ],
    "is_legacy": true,
    "sort_order": 1051
  },
  {
    "subarea_id": "training_thigh_biceps",
    "target_area": "허벅지",
    "label_ko": "대퇴이두근 전체",
    "label_en": "Biceps femoris overall",
    "body_group": "training",
    "side": "center",
    "views": [
      "back"
    ],
    "atlas_muscle_ids": [
      "biceps_femoris_r",
      "biceps_femoris_l"
    ],
    "is_legacy": true,
    "sort_order": 1052
  },
  {
    "subarea_id": "training_thigh_biceps_long",
    "target_area": "허벅지",
    "label_ko": "대퇴이두근 장두",
    "label_en": "Biceps femoris long head",
    "body_group": "training",
    "side": "center",
    "views": [
      "back"
    ],
    "atlas_muscle_ids": [
      "biceps_femoris_r",
      "biceps_femoris_l"
    ],
    "is_legacy": true,
    "sort_order": 1053
  },
  {
    "subarea_id": "training_thigh_biceps_short",
    "target_area": "허벅지",
    "label_ko": "대퇴이두근 단두",
    "label_en": "Biceps femoris short head",
    "body_group": "training",
    "side": "center",
    "views": [
      "back"
    ],
    "atlas_muscle_ids": [
      "biceps_femoris_r",
      "biceps_femoris_l"
    ],
    "is_legacy": true,
    "sort_order": 1054
  },
  {
    "subarea_id": "training_thigh_medial_hamstrings",
    "target_area": "허벅지",
    "label_ko": "내측 햄스트링",
    "label_en": "Medial hamstrings",
    "body_group": "training",
    "side": "center",
    "views": [
      "back",
      "front"
    ],
    "atlas_muscle_ids": [
      "semimembranosus_2_r",
      "semimembranosus_1_r",
      "semimembranosus_2_l",
      "semimembranosus_1_l",
      "semitendinosus_r",
      "semitendinosus_l"
    ],
    "is_legacy": true,
    "sort_order": 1055
  },
  {
    "subarea_id": "training_calf_gastrocnemius",
    "target_area": "종아리",
    "label_ko": "비복근",
    "label_en": "Gastrocnemius",
    "body_group": "training",
    "side": "center",
    "views": [
      "front",
      "back"
    ],
    "atlas_muscle_ids": [
      "gastrocnemius_r",
      "gastrocnemius_l"
    ],
    "is_legacy": true,
    "sort_order": 1056
  },
  {
    "subarea_id": "training_calf_soleus",
    "target_area": "종아리",
    "label_ko": "가자미근",
    "label_en": "Soleus",
    "body_group": "training",
    "side": "center",
    "views": [],
    "atlas_muscle_ids": [],
    "is_legacy": true,
    "sort_order": 1057
  }
]
$training_catalog$::jsonb) AS catalog(
    subarea_id varchar(100), target_area varchar(20), label_ko varchar(100),
    label_en varchar(150), body_group varchar(30), side varchar(10),
    views jsonb, atlas_muscle_ids jsonb, is_legacy boolean, sort_order integer
)
ON CONFLICT (subarea_id) DO NOTHING;
