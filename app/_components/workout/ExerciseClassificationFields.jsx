import { useLanguage } from '../../_hooks/useLanguage';
import { exercise_target_areas } from '../../_lib/exerciseClassification';

export default function ExerciseClassificationFields({ target_area, target_subarea, disabled, on_area_change, on_subarea_change }) {
  const { t } = useLanguage();
  const target_subareas = exercise_target_areas[target_area] || [];

  return <>
    <label className="fieldLabel" htmlFor="exercise-target-area">{t('타겟 부위')}</label>
    <select id="exercise-target-area" className="timeInput" value={target_area} disabled={disabled} onChange={(event) => {
      on_area_change(event.target.value);
      on_subarea_change('');
    }} required>
      <option value="">{t('부위를 선택하세요')}</option>
      {Object.keys(exercise_target_areas).map((area) => <option key={area} value={area}>{t(area)}</option>)}
    </select>
    {target_area && <>
      <label className="fieldLabel" htmlFor="exercise-target-subarea">{t('세부분류 (선택)')}</label>
      <select id="exercise-target-subarea" className="timeInput" value={target_subarea} disabled={disabled} onChange={(event) => on_subarea_change(event.target.value)} aria-describedby="exercise-classification-help">
        <option value="">{t('선택 안 함 · 기본 분류 사용')}</option>
        {target_subareas.map((subarea) => <option key={subarea} value={subarea}>{t(subarea)}</option>)}
      </select>
      <p id="exercise-classification-help" className="infoText">{t('선택하면 리포트에 세부분류가 반영됩니다. 미선택 시 기본 분류를 사용합니다.')}</p>
    </>}
  </>;
}
