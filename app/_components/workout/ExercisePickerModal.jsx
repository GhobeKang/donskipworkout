import { useEffect, useMemo, useRef, useState } from 'react';
import { exercise_label, exercise_matches_query, exercise_secondary_label } from '../../_lib/i18n';
import { exercise_area_label } from '../../_lib/exerciseClassification';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';

export default function ExercisePickerModal({ is_open, exercises, on_select, on_create, on_close }) {
  const { t, language } = useLanguage();
  const [search_query, set_search_query] = useState('');
  const modal_ref = useRef(null);
  const search_input_ref = useRef(null);
  const on_close_ref = useRef(on_close);
  on_close_ref.current = on_close;
  const ordered_exercises = useMemo(() => {
    const name_collator = new Intl.Collator(language === 'en' ? 'en-US' : 'ko-KR', {
      sensitivity: 'base', numeric: true,
    });
    const matching_exercises = exercises.filter((exercise) => exercise_matches_query(exercise, search_query));
    return matching_exercises.sort((first_exercise, second_exercise) => {
      const first_source_priority = first_exercise.exercise_source === 'custom' ? 0 : 1;
      const second_source_priority = second_exercise.exercise_source === 'custom' ? 0 : 1;
      if (first_source_priority !== second_source_priority) {
        return first_source_priority - second_source_priority;
      }
      const name_comparison = name_collator.compare(
        exercise_label(first_exercise, language), exercise_label(second_exercise, language),
      );
      return name_comparison || first_exercise.exercise_id - second_exercise.exercise_id;
    });
  }, [exercises, language, search_query]);

  useEffect(() => {
    if (!is_open) return undefined;
    const previously_focused = document.activeElement;
    const previous_overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    set_search_query('');
    search_input_ref.current?.focus();
    const handle_key_down = (event) => {
      if (event.key === 'Escape') on_close_ref.current();
      if (event.key !== 'Tab') return;
      const focusable_elements = [...modal_ref.current.querySelectorAll(
        'button:not(:disabled), input:not(:disabled)',
      )];
      const first_element = focusable_elements[0];
      const last_element = focusable_elements.at(-1);
      if (event.shiftKey && document.activeElement === first_element) {
        event.preventDefault();
        last_element?.focus();
      } else if (!event.shiftKey && document.activeElement === last_element) {
        event.preventDefault();
        first_element?.focus();
      }
    };
    document.addEventListener('keydown', handle_key_down);
    return () => {
      document.removeEventListener('keydown', handle_key_down);
      document.body.style.overflow = previous_overflow;
      previously_focused?.focus();
    };
  }, [is_open]);

  if (!is_open) return null;

  return <div className="modalBackdrop exercisePickerBackdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) on_close();
  }}>
    <section className="actionModal exercisePickerModal" ref={modal_ref} role="dialog" aria-modal="true" aria-labelledby="exercise-picker-title" aria-describedby="exercise-picker-description">
      <div className="modalHandle" aria-hidden="true" />
      <button className="modalCloseButton" type="button" aria-label={t("팝업 닫기")} onClick={on_close}><MaterialIcon>close</MaterialIcon></button>
      <div className="exercisePickerHeader">
        <p className="modalEyebrow">{t("운동 세트")}</p>
        <h2 id="exercise-picker-title">{t("세션에 추가할 종목 선택")}</h2>
        <p id="exercise-picker-description" className="modalMessage">{t("종목을 선택하면 세트 입력 카드가 바로 추가됩니다.")}</p>
      </div>
      <label className="fieldLabel" htmlFor="exercise-picker-search">{t("운동 종목 검색")}</label>
      <div className="exercisePickerSearch">
        <MaterialIcon>search</MaterialIcon>
        <input id="exercise-picker-search" ref={search_input_ref} type="search" value={search_query} onChange={(event) => set_search_query(event.target.value)} placeholder={t("한글 또는 영문 이름으로 검색")} autoComplete="off" />
      </div>
      {ordered_exercises.length ? <ul className="exercisePickerList" aria-label={t("세션에 추가할 종목 선택")}>
        {ordered_exercises.map((exercise) => {
          const exercise_name = exercise_label(exercise, language);
          const secondary_name = exercise_secondary_label(exercise, language);
          const last_sets = exercise.last_sets?.length
            ? t("최근 {0}", [exercise.last_sets.map((workout_set) => t("{0}kg × {1}회", [workout_set.weight_kg, workout_set.reps])).join(' · ')])
            : t("아직 기록한 세트가 없습니다");
          return <li key={`${exercise.exercise_source}:${exercise.exercise_id}`}>
            <button className="exercisePickerOption" type="button" onClick={() => {
              on_select(exercise);
              on_close();
            }}>
              <span className="exercisePickerOptionText">
                <span><strong>{exercise_name}</strong><span className="exerciseSourceBadge">{exercise.exercise_source === 'shared' ? t("기본") : t("내 종목")}</span></span>
                {secondary_name && <small className="exerciseAlternateName">{secondary_name}</small>}
                <small>{exercise_area_label(exercise, language)}</small>
                <small>{last_sets}</small>
              </span>
              <MaterialIcon>add_circle</MaterialIcon>
            </button>
          </li>;
        })}
      </ul> : <div className="exercisePickerEmpty">
        <MaterialIcon>search_off</MaterialIcon>
        <p>{exercises.length ? t("검색 결과가 없습니다. 다른 이름으로 검색하거나 새 종목을 만들어 보세요.") : t("추가할 수 있는 종목이 없습니다.")}</p>
        <button className="textButton" type="button" onClick={() => { on_close(); on_create(); }}>{t("새 종목 만들기")}</button>
      </div>}
    </section>
  </div>;
}
