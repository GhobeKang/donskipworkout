import exercise_target_areas from '../../server/app/exercise_target_areas.json';
import subarea_catalog from '../../server/app/exercise_subareas.json';
import { translate } from './i18n';

export { exercise_target_areas };
const subarea_labels = new Map(subarea_catalog.map((subarea) => [subarea.label_ko, subarea.label_en]));

export function subarea_label(subarea, language) {
  return language === 'en' ? subarea.label_en || subarea.label_ko : subarea.label_ko;
}

export function muscle_target_label(target, language) {
  return target.subarea_id && target.label_ko
    ? `${translate(target.target_area, [], language)} · ${subarea_label(target, language)}`
    : report_area_label([target.target_area, target.target_subarea].filter(Boolean).join(' · '), language);
}

export function report_area_label(target_area, language) {
  return (target_area || '타겟 부위 미설정').split(' · ')
    .map((area) => language === 'en' && subarea_labels.has(area) ? subarea_labels.get(area) : translate(area, [], language)).join(' · ');
}

export function exercise_area_label(exercise, language) {
  if (exercise.target_subareas?.length) return exercise.target_subareas.map((target) => muscle_target_label(target, language)).join(' / ');
  const target_area = exercise.target_subarea
    ? `${exercise.target_area} · ${exercise.target_subarea}` : exercise.target_area;
  return report_area_label(target_area, language);
}
