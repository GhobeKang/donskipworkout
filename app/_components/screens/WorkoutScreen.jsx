import { exercise_label, exercise_matches_query, exercise_secondary_label } from '../../_lib/i18n';
import { exercise_area_label } from '../../_lib/exerciseClassification';
import { useLanguage } from '../../_hooks/useLanguage';
import { useState } from 'react';
import useApiResource from '../../_hooks/useApiResource';
import { api_request } from '../../_lib/api';
import RequestState from '../ui/RequestState';
import MaterialIcon from '../ui/MaterialIcon';
import ExerciseEditorModal from '../workout/ExerciseEditorModal';
import ExerciseResearchModal from '../workout/ExerciseResearchModal';
import ExerciseResearchSummary from '../workout/ExerciseResearchSummary';

export default function WorkoutScreen({ on_unauthorized, on_back, on_catalog_change, on_research_change }) {
  const { t, language, localize_message } = useLanguage();
  const [revision, set_revision] = useState(0);
  const [search_query, set_search_query] = useState('');
  const [is_editor_open, set_is_editor_open] = useState(false);
  const [editing_exercise, set_editing_exercise] = useState(null);
  const [research_exercise, set_research_exercise] = useState(null);
  const [pending_id, set_pending_id] = useState(null);
  const [error_message, set_error_message] = useState('');
  const exercises = useApiResource('/exercises', revision, on_unauthorized);
  const matching_exercises = exercises.data?.filter((exercise) => exercise_matches_query(exercise, search_query));

  const open_editor = (exercise = null) => {
    if (pending_id !== null) return;
    set_editing_exercise(exercise);
    set_error_message('');
    set_is_editor_open(true);
  };

  const close_editor = () => {
    if (pending_id !== null) return;
    set_is_editor_open(false);
    set_editing_exercise(null);
    set_error_message('');
  };

  const save_exercise = async (exercise_input) => {
    if (pending_id !== null) return;
    const editing_id = editing_exercise?.exercise_id;
    set_pending_id(editing_id || 'new');
    set_error_message('');
    try {
      await api_request(editing_id ? `/exercises/custom/${editing_id}` : '/exercises', {
        method: editing_id ? 'PUT' : 'POST', body: exercise_input,
      });
      set_is_editor_open(false);
      set_editing_exercise(null);
      set_revision((value) => value + 1);
      on_catalog_change();
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(error.message);
    } finally {
      set_pending_id(null);
    }
  };

  const remove_exercise = async (exercise) => {
    if (pending_id !== null || !window.confirm(t("{0} 종목을 삭제할까요? 저장된 운동 기록은 유지되며, 연구 기록은 함께 삭제됩니다.", [exercise.name]))) return;
    set_pending_id(exercise.exercise_id);
    set_error_message('');
    try {
      await api_request(`/exercises/custom/${exercise.exercise_id}`, { method: 'DELETE' });
      set_revision((value) => value + 1);
      on_catalog_change();
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(error.message);
    } finally {
      set_pending_id(null);
    }
  };

  return <section className="viewPanel isVisible">
    <header className="pageHeader simple exerciseLibraryHeader">
      <button type="button" className="textButton" onClick={on_back}>{t("세트 기록으로 돌아가기")}</button>
      <div className="exerciseLibraryTitle">
        <h1>{t("운동 종목 관리")}</h1>
        <MaterialIcon>fitness_center</MaterialIcon>
      </div>
    </header>
    <p className="infoText">{t("운동 세트 기록에서 사용할 종목을 관리합니다. 공용 종목과 직접 등록한 종목을 함께 기록할 수 있습니다.")}</p>
    <button className="wideButton primary" type="button" aria-haspopup="dialog" disabled={pending_id !== null} onClick={() => open_editor()}><MaterialIcon>add</MaterialIcon>{t("운동 종목 추가")}</button>
    {is_editor_open && <ExerciseEditorModal exercise={editing_exercise} pending={pending_id !== null} error_message={error_message} on_save={save_exercise} on_close={close_editor} />}
    {research_exercise && <ExerciseResearchModal key={`${research_exercise.exercise_source}:${research_exercise.exercise_id}`} exercise={research_exercise} on_change={() => {
      set_revision((value) => value + 1);
      on_research_change();
    }} on_close={() => set_research_exercise(null)} on_unauthorized={on_unauthorized} />}
    {!is_editor_open && error_message && <p className="errorText" role="alert">{localize_message(error_message)}</p>}
    <RequestState loading={exercises.loading} error={exercises.error} on_retry={() => set_revision((value) => value + 1)} />
    {exercises.data && <section className="exerciseLibrary" aria-label={t("운동 종목 목록")}>
      <label className="fieldLabel" htmlFor="exercise-library-search">{t("운동 종목 검색")}</label>
      <div className="exercisePickerSearch">
        <MaterialIcon>search</MaterialIcon>
        <input id="exercise-library-search" type="search" value={search_query} onChange={(event) => set_search_query(event.target.value)} placeholder={t("한글 또는 영문 이름으로 검색")} autoComplete="off" />
      </div>
      <div className="recentHeading"><h2>{t("운동 종목")}</h2><span>{exercises.data.length}{t("개")}</span></div>
      {matching_exercises.length ? matching_exercises.map((exercise) => {
        const secondary_name = exercise_secondary_label(exercise, language);
        return <article className="exerciseLibraryItem" key={`${exercise.exercise_source}:${exercise.exercise_id}`}>
        <div className="exerciseLibraryText"><strong>{exercise_label(exercise, language)} <span className="exerciseSourceBadge">{exercise.exercise_source === 'shared' ? t("기본") : t("내 종목")}</span></strong>
          {secondary_name && <small className="exerciseAlternateName">{secondary_name}</small>}
          <small>{exercise_area_label(exercise, language)}{exercise.last_sets.length ? ` · ${t("최근 {0}", [exercise.last_sets.map((item) => t("{0}kg × {1}회", [item.weight_kg, item.reps])).join(' · ')])}` : ` · ${t("아직 기록한 세트가 없습니다")}`}</small>
          <ExerciseResearchSummary latest_record={exercise.latest_research_record} on_open={() => set_research_exercise(exercise)} disabled={pending_id !== null} />
        </div>
        {exercise.exercise_source === 'custom' && <div className="exerciseItemActions">
          <button type="button" aria-label={t("{0} 종목 수정", [exercise.name])} aria-haspopup="dialog" disabled={pending_id !== null} onClick={() => open_editor(exercise)}><MaterialIcon>edit</MaterialIcon></button>
          <button type="button" aria-label={t("{0} 삭제", [exercise.name])} disabled={pending_id !== null} onClick={() => remove_exercise(exercise)}><MaterialIcon>delete</MaterialIcon></button>
        </div>}
      </article>;
      }) : <p className="emptyState">{exercises.data.length ? t("검색 결과가 없습니다. 다른 이름으로 검색하거나 새 종목을 만들어 보세요.") : t("등록한 운동 종목이 없습니다. 자주 하는 운동부터 추가해 보세요.")}</p>}
    </section>}
  </section>;
}
