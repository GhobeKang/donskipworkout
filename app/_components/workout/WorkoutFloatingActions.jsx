import { useState } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';
import ExercisePickerModal from './ExercisePickerModal';

export default function WorkoutFloatingActions({ exercises, exercise_groups, on_add_exercise, on_open_library }) {
  const { t } = useLanguage();
  const [picker_is_open, set_picker_is_open] = useState(false);
  const selected_exercise_keys = new Set(exercise_groups.map(
    (group) => `${group.exercise_source}:${group.exercise_id}`,
  ));
  const available_exercises = exercises.filter(
    (exercise) => !selected_exercise_keys.has(`${exercise.exercise_source}:${exercise.exercise_id}`),
  );
  const can_add_exercise = available_exercises.length > 0 && exercise_groups.length < 30;

  return <>
    <div className="workoutFloatingActions" role="group" aria-label={t("운동 종목 추가")}>
      <button className="workoutFloatingButton secondary" type="button" onClick={on_open_library}>
        <MaterialIcon>add_box</MaterialIcon><span>{t("새 종목 만들기")}</span>
      </button>
      <button className="workoutFloatingButton primary" type="button" disabled={!can_add_exercise} onClick={() => set_picker_is_open(true)}>
        <MaterialIcon>playlist_add</MaterialIcon><span>{t("세션에 종목 추가")}</span>
      </button>
    </div>
    <ExercisePickerModal is_open={picker_is_open} exercises={available_exercises} on_select={on_add_exercise} on_create={on_open_library} on_close={() => set_picker_is_open(false)} />
  </>;
}
