import { useLanguage } from '../../_hooks/useLanguage';
import { subarea_label } from '../../_lib/exerciseClassification';
import picker_styles from './ExerciseTargetPicker.module.css';

const short_labels = {
  '상부 가슴': '상부', '중부 가슴': '중부', '하부 가슴': '하부',
};

export default function ExerciseTargetOptions({ title, note, targets, selected_ids, disabled, on_toggle }) {
  const { t, language } = useLanguage();
  return <fieldset className={picker_styles.regionPicker} disabled={disabled}>
    <legend>{t(title)}</legend>
    {note && <p className="infoText">{t(note)}</p>}
    <div className={picker_styles.regionOptions}>{targets.map((target) => {
      const label = subarea_label(target, language);
      return <button type="button" key={target.subarea_id} disabled={disabled}
        aria-pressed={selected_ids.includes(target.subarea_id)} onClick={() => on_toggle(target.subarea_id)}>
        <strong>{short_labels[target.label_ko] ? t(short_labels[target.label_ko]) : label}</strong>
        {short_labels[target.label_ko] && <small>{label}</small>}
        {target.map_precision === 'none' && <small>{t('지도 도형 없음')}</small>}
      </button>;
    })}</div>
  </fieldset>;
}
