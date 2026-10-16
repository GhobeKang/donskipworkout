import { exercise_label } from '../../_lib/i18n';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';

export default function WorkoutSetBuilder({
  exercises,
  exercise_groups,
  expanded_exercise_key,
  on_change,
  on_toggle_exercise,
  on_open_area_import,
  disabled,
}) {
  const { t, language } = useLanguage();
  const change_set = (group_index, set_index, field_name, value) => {
    on_change(exercise_groups.map((group, current_group_index) => current_group_index === group_index
      ? { ...group, sets: group.sets.map((workout_set, current_set_index) => current_set_index === set_index ? { ...workout_set, [field_name]: value } : workout_set) }
      : group));
  };

  return <section className="workoutBuilder" aria-labelledby="workout-builder-heading">
    <div className="workoutBuilderHeading">
      <div><h2 id="workout-builder-heading">{t("운동 세트")}</h2><p className="infoText">{t('지난 기록을 불러오고, 오늘의 숫자를 남겨.')}</p></div>
      <button className="textButton workoutAreaImportButton" type="button" disabled={disabled} onClick={on_open_area_import}><MaterialIcon>history</MaterialIcon>{t('부위별 불러오기')}</button>
    </div>
    {!exercises.length && <div className="emptyState">{t("등록한 운동 종목이 없습니다.")}</div>}
    {exercise_groups.map((group, group_index) => {
      const exercise = exercises.find((item) => item.exercise_source === group.exercise_source && item.exercise_id === group.exercise_id);
      const exercise_name = exercise_label(exercise || group, language) || t('운동');
      const exercise_key = `${group.exercise_source}:${group.exercise_id}`;
      const group_content_id = `workout-group-content-${group.exercise_source}-${group.exercise_id}`;
      const is_expanded = expanded_exercise_key === exercise_key;
      const previous_sets = group.import_record?.sets || exercise?.last_sets;
      return <article className="workoutGroup" id={`workout-group-${group.exercise_source}-${group.exercise_id}`} key={`${group.exercise_source}:${group.exercise_id}`}>
        <div className="workoutGroupHeading">
          <h3>
            <button className="workoutGroupToggle" type="button" aria-expanded={is_expanded} aria-controls={group_content_id} onClick={() => on_toggle_exercise(exercise_key)}>
              <span>{exercise_name}</span>
              <small>{group.sets.length} {t("세트")}</small>
              <MaterialIcon>{is_expanded ? 'expand_less' : 'expand_more'}</MaterialIcon>
            </button>
          </h3>
          <button className="workoutGroupRemove" type="button" aria-label={t("{0} 제거", [exercise_name])} disabled={disabled} onClick={() => on_change(exercise_groups.filter((_, index) => index !== group_index))}><MaterialIcon>close</MaterialIcon></button>
        </div>
        {group.import_record && <p className="workoutImportSource">{t('{0} 기록 · 최근 같은 부위 운동에서 {1}회 기록', [group.import_record.workout_date, group.import_record.session_count])}</p>}
        <div id={group_content_id} hidden={!is_expanded}>
          <p className="previousSets">{previous_sets?.length ? t('지난 기록 · {0}', [previous_sets.map((workout_set) => t('{0}kg × {1}회', [workout_set.weight_kg, workout_set.reps])).join(' / ')]) : t('첫 세트가 기준이 된다.')}</p>
          <div className="workoutSetLabels"><span>{t("세트")}</span><span>{t("중량 kg")}</span><span>{t("반복 횟수")}</span><span /></div>
          {group.sets.map((workout_set, set_index) => <div className="workoutSetRow" key={set_index}>
            <span>{set_index + 1}</span>
            <input type="number" inputMode="decimal" min="0" max="999.99" step="0.01" aria-label={t("{0} {1}세트 중량 kg", [exercise_name, set_index + 1])} value={workout_set.weight_kg} disabled={disabled} required onChange={(event) => change_set(group_index, set_index, 'weight_kg', event.target.value)} />
            <input type="number" inputMode="numeric" min="1" max="1000" step="1" aria-label={t("{0} {1}세트 반복 횟수", [exercise_name, set_index + 1])} value={workout_set.reps} disabled={disabled} required onChange={(event) => change_set(group_index, set_index, 'reps', event.target.value)} />
            <button type="button" aria-label={t("{0} {1}세트 삭제", [exercise_name, set_index + 1])} disabled={disabled || group.sets.length === 1} onClick={() => on_change(exercise_groups.map((item, index) => index === group_index ? { ...item, sets: item.sets.filter((_, item_index) => item_index !== set_index) } : item))}><MaterialIcon>remove_circle</MaterialIcon></button>
          </div>)}
          <button className="textButton workoutAddSet" type="button" disabled={disabled || group.sets.length >= 20} onClick={() => on_change(exercise_groups.map((item, index) => index === group_index ? { ...item, sets: [...item.sets, { ...item.sets.at(-1) }] } : item))}>{t("+ 세트 추가")}</button>
        </div>
      </article>;
    })}
  </section>;
}
