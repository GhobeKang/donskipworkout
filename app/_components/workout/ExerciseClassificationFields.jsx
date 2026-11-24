import { useId } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import { exercise_target_areas } from '../../_lib/exerciseClassification';
import ExerciseTargetPicker from './ExerciseTargetPicker';

export default function ExerciseClassificationFields({ target_area, target_subarea_ids, disabled, on_area_change, on_subarea_ids_change, on_unauthorized }) {
  const { t } = useLanguage();
  const area_input_id = useId();
  const change_area = (next_area) => {
    if (next_area === target_area) return;
    on_area_change(next_area);
    on_subarea_ids_change([]);
  };
  return <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: '12px 0' }}>
    <legend className="fieldLabel">{t('타겟 부위')}</legend>
    <label className="fieldLabel" htmlFor={area_input_id}>{t('큰 카테고리')}</label>
    <select id={area_input_id} className="timeInput" value={target_area} required onChange={(event) => change_area(event.target.value)}>
      <option value="">{t('큰 카테고리를 선택하세요')}</option>
      {Object.keys(exercise_target_areas).map((area) => <option key={area} value={area}>{t(area)}</option>)}
    </select>
    {target_area ? <>
      <p className="fieldLabel" style={{ marginTop: 12 }}>{t('운동 타겟 (여러 개 선택)')}</p>
      <ExerciseTargetPicker key={target_area} target_area={target_area} selected_ids={target_subarea_ids} disabled={disabled} on_change={on_subarea_ids_change} on_unauthorized={on_unauthorized} />
    </> : <p className="infoText">{t('큰 카테고리를 먼저 선택해 주세요.')}</p>}
  </fieldset>;
}
