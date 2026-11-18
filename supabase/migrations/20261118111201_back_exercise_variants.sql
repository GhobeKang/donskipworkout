SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

-- Technique-specific choices represent the intended emphasis, not isolated activation.
-- Shoulder abduction and the pulling path matter in addition to the grip:
-- https://doi.org/10.47206/ijsc.v3i1.190
-- https://doi.org/10.5114/jhk/209550
-- https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-high-row
-- Keep existing exercise IDs, classifications, research notes and workout history.
-- Never infer the technique used in historical generic row records.
INSERT INTO attendance.shared_exercise_items (name, target_area, target_subarea)
VALUES
    ('하이 로우 (상부 등 중심)', '등', '상부 등'),
    ('하이 로우 (광배근 중심)', '등', '광배근'),
    ('시티드 로우 (와이드 그립 · 팔꿈치 벌림)', '등', '상부 등'),
    ('시티드 로우 (뉴트럴 그립 · 팔꿈치 붙임)', '등', '광배근'),
    ('시티드 로우 (언더 그립 · 팔꿈치 붙임)', '등', '광배근'),
    ('머신 로우 (와이드 그립 · 팔꿈치 벌림)', '등', '상부 등'),
    ('머신 로우 (뉴트럴 그립 · 팔꿈치 붙임)', '등', '광배근'),
    ('머신 로우 (언더 그립 · 팔꿈치 붙임)', '등', '광배근'),
    ('T바 로우 (와이드 그립 · 팔꿈치 벌림)', '등', '상부 등'),
    ('T바 로우 (뉴트럴 그립 · 팔꿈치 붙임)', '등', '광배근'),
    ('체스트 서포티드 로우 (팔꿈치 벌림)', '등', '중부 등'),
    ('체스트 서포티드 로우 (팔꿈치 붙임)', '등', '광배근')
ON CONFLICT (lower(name)) DO NOTHING;
