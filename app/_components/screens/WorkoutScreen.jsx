import { exercise_label } from '../../_lib/i18n';
import { useLanguage } from '../../_hooks/useLanguage';
import { useState } from 'react';
import useApiResource from '../../_hooks/useApiResource';
import { api_request } from '../../_lib/api';
import RequestState from '../ui/RequestState';
import MaterialIcon from '../ui/MaterialIcon';

export default function WorkoutScreen({ on_unauthorized, on_back, on_catalog_change }) {
  const { t, language, localize_message } = useLanguage();
  const [revision, set_revision] = useState(0);
  const [name, set_name] = useState('');
  const [editing_id, set_editing_id] = useState(null);
  const [pending_id, set_pending_id] = useState(null);
  const [error_message, set_error_message] = useState('');
  const exercises = useApiResource('/exercises', revision, on_unauthorized);

  const save_exercise = async (event) => {
    event.preventDefault();
    const trimmed_name = name.trim();
    if (!trimmed_name || pending_id !== null) return;
    set_pending_id(editing_id || 'new');
    set_error_message('');
    try {
      await api_request(editing_id ? `/exercises/custom/${editing_id}` : '/exercises', {
        method: editing_id ? 'PUT' : 'POST', body: { name: trimmed_name },
      });
      set_name('');
      set_editing_id(null);
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
    if (pending_id !== null || !window.confirm(t("{0} 종목을 삭제할까요? 저장된 운동 기록은 유지됩니다.", [exercise.name]))) return;
    set_pending_id(exercise.exercise_id);
    set_error_message('');
    try {
      await api_request(`/exercises/custom/${exercise.exercise_id}`, { method: 'DELETE' });
      if (editing_id === exercise.exercise_id) {
        set_editing_id(null);
        set_name('');
      }
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
    <form className="exerciseEditor" onSubmit={save_exercise}>
      <label className="fieldLabel" htmlFor="exercise-name">{t("운동 종목 이름")}</label>
      <div className="exerciseEditorRow">
        <input id="exercise-name" className="timeInput" value={name} maxLength={100} disabled={pending_id !== null} onChange={(event) => set_name(event.target.value)} placeholder={t("예: 케이블 크런치")} required />
        <button className="textButton" type="submit" disabled={!name.trim() || pending_id !== null}>{editing_id ? t("수정") : t("추가")}</button>
      </div>
      {editing_id && <button className="exerciseCancel textButton" type="button" onClick={() => { set_editing_id(null); set_name(''); }}>{t("취소")}</button>}
    </form>
    {error_message && <p className="errorText" role="alert">{localize_message(error_message)}</p>}
    <RequestState loading={exercises.loading} error={exercises.error} on_retry={() => set_revision((value) => value + 1)} />
    {exercises.data && <section className="exerciseLibrary" aria-label={t("운동 종목 목록")}>
      <div className="recentHeading"><h2>{t("운동 종목")}</h2><span>{exercises.data.length}{t("개")}</span></div>
      {exercises.data.length ? exercises.data.map((exercise) => <article className="exerciseLibraryItem" key={`${exercise.exercise_source}:${exercise.exercise_id}`}>
        <div><strong>{exercise_label(exercise, language)} <span className="exerciseSourceBadge">{exercise.exercise_source === 'shared' ? t("기본") : t("내 종목")}</span></strong><small>{exercise.last_sets.length ? t("최근 {0}", [exercise.last_sets.map((item) => t("{0}kg × {1}회", [item.weight_kg, item.reps])).join(' · ')]) : t("아직 기록한 세트가 없습니다")}</small></div>
        {exercise.exercise_source === 'custom' && <div className="exerciseItemActions">
          <button type="button" aria-label={t("{0} 이름 수정", [exercise.name])} disabled={pending_id !== null} onClick={() => { set_editing_id(exercise.exercise_id); set_name(exercise.name); }}><MaterialIcon>edit</MaterialIcon></button>
          <button type="button" aria-label={t("{0} 삭제", [exercise.name])} disabled={pending_id !== null} onClick={() => remove_exercise(exercise)}><MaterialIcon>delete</MaterialIcon></button>
        </div>}
      </article>) : <p className="emptyState">{t("등록한 운동 종목이 없습니다. 자주 하는 운동부터 추가해 보세요.")}</p>}
    </section>}
  </section>;
}
