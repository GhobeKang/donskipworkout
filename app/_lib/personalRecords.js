import { translate } from './i18n';

export const personal_record_method = '최대 중량을 우선하고, 중량이 같으면 반복 횟수를 비교합니다. 중량과 횟수는 같은 세트의 기록입니다. 그날 이전 최고 기록을 넘긴 종목을 기간별로 한 번씩 모으며, 첫 운동일과 동률은 PR 갱신에 포함하지 않습니다. 출석 여부와 관계없이 저장한 세트 기준입니다.';

export function best_workout_set(previous_best, workout_sets) {
  return workout_sets.reduce((best_set, workout_set) => {
    if (workout_set.weight_kg === '' || workout_set.reps === '') return best_set;
    const weight_kg = Number(workout_set.weight_kg);
    const reps = Number(workout_set.reps);
    if (!Number.isFinite(weight_kg) || weight_kg < -999.99 || weight_kg > 999.99
      || String(weight_kg).split('.')[1]?.length > 2
      || !Number.isInteger(reps) || reps < 1 || reps > 1000) return best_set;
    if (!best_set || weight_kg > best_set.weight_kg
      || (weight_kg === best_set.weight_kg && reps > best_set.reps)) return { weight_kg, reps };
    return best_set;
  }, previous_best || null);
}

export function personal_record_text(record, language) {
  const set_text = (workout_set) => translate('{0}kg × {1}회', [workout_set.weight_kg, workout_set.reps], language);
  return `${set_text(record.previous_best)} → ${set_text(record.current_best)}`;
}
