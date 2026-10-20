import { useLanguage } from '../../_hooks/useLanguage';
import { best_workout_set } from '../../_lib/personalRecords';

export default function ExercisePersonalBest({ previous_best, sets }) {
  const { t } = useLanguage();
  const best_set = best_workout_set(previous_best, sets);
  const has_personal_record = previous_best && best_set !== previous_best;
  return <p className="exercisePersonalBest">
    <span>{t('최고 기록')}</span>
    <strong>{best_set ? t('{0}kg × {1}회', [best_set.weight_kg, best_set.reps]) : t('아직 기록 없음')}</strong>
    {has_personal_record && <small className="personalRecordBadge">{t('PR 갱신')}</small>}
  </p>;
}
