import exercise_target_areas from '../../server/app/exercise_target_areas.json';
import { translate } from './i18n';

export { exercise_target_areas };

export function report_area_label(target_area, language) {
  return (target_area || '타겟 부위 미설정').split(' · ')
    .map((area) => translate(area, [], language)).join(' · ');
}

export function exercise_area_label(exercise, language) {
  const target_area = exercise.target_subarea
    ? `${exercise.target_area} · ${exercise.target_subarea}` : exercise.target_area;
  return report_area_label(target_area, language);
}
