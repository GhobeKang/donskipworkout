'use client';

import { useLanguage } from '../../_hooks/useLanguage';

import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import useApiResource from '../../_hooks/useApiResource';
import { api_request } from '../../_lib/api';
import WorkoutSetBuilder from '../workout/WorkoutSetBuilder';
import WorkoutFloatingActions from '../workout/WorkoutFloatingActions';
import AreaWorkoutImportModal from '../workout/AreaWorkoutImportModal';
import ExerciseResearchModal from '../workout/ExerciseResearchModal';
import MaterialIcon from '../ui/MaterialIcon';
import RequestState from '../ui/RequestState';

function current_workout_date(timezone) {
  const date_parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const date_values = Object.fromEntries(date_parts.map(({ type, value }) => [type, value]));
  return `${date_values.year}-${date_values.month}-${date_values.day}`;
}

function storage_key_for(user_uuid, workout_date) {
  return `workout_set_draft:${user_uuid}:${workout_date}`;
}

function exercise_key_for(group) {
  return group ? `${group.exercise_source}:${group.exercise_id}` : '';
}

function normalize_groups(exercise_groups) {
  if (!Array.isArray(exercise_groups) || exercise_groups.length > 30) return null;
  const exercise_keys = new Set();
  const normalized_groups = [];
  for (const group of exercise_groups) {
    if (!group || !['shared', 'custom'].includes(group.exercise_source)
      || !Number.isInteger(Number(group.exercise_id)) || Number(group.exercise_id) < 1
      || !Array.isArray(group.sets) || group.sets.length < 1 || group.sets.length > 20) return null;
    const exercise_key = `${group.exercise_source}:${group.exercise_id}`;
    if (exercise_keys.has(exercise_key)) return null;
    exercise_keys.add(exercise_key);
    const sets = [];
    for (const workout_set of group.sets) {
      if (workout_set.weight_kg === '' || workout_set.reps === '') return null;
      const weight_kg = Number(workout_set.weight_kg);
      const reps = Number(workout_set.reps);
      if (!Number.isFinite(weight_kg) || weight_kg < -999.99 || weight_kg > 999.99
        || String(weight_kg).split('.')[1]?.length > 2
        || !Number.isInteger(reps) || reps < 1 || reps > 1000) return null;
      sets.push({ weight_kg, reps });
    }
    const normalized_group = {
      exercise_source: group.exercise_source,
      exercise_id: Number(group.exercise_id),
      sets,
    };
    if (group.exercise_name) normalized_group.exercise_name = group.exercise_name;
    normalized_groups.push(normalized_group);
  }
  return normalized_groups;
}

function read_saved_draft(storage_key) {
  try {
    const saved_draft = window.localStorage.getItem(storage_key);
    if (!saved_draft) return null;
    const parsed_draft = JSON.parse(saved_draft);
    return {
      raw: saved_draft,
      groups: parsed_draft.exercise_groups,
      retry_count: Number.isInteger(parsed_draft.retry_count)
        && parsed_draft.retry_count >= 0 && parsed_draft.retry_count <= 3
        ? parsed_draft.retry_count : 0,
    };
  } catch {
    try { window.localStorage.removeItem(storage_key); } catch {}
    return null;
  }
}

export default function WorkoutLogScreen({ ref, user_uuid, initial_workout_date, is_active, catalog_revision, research_revision, on_research_change, on_unauthorized, on_open_library, on_open_checkin, on_saved, timezone = 'Asia/Seoul' }) {
  const { t, localize_message } = useLanguage();
  const [selected_date, set_selected_date] = useState(initial_workout_date || current_workout_date(timezone));
  const initial_date_applied_ref = useRef(Boolean(initial_workout_date));
  const [resource_revision, set_resource_revision] = useState(0);
  const [exercise_groups, set_exercise_groups] = useState([]);
  const exercise_groups_ref = useRef(exercise_groups);
  exercise_groups_ref.current = exercise_groups;
  const [area_import_is_open, set_area_import_is_open] = useState(false);
  const [research_exercise, set_research_exercise] = useState(null);
  const [import_message, set_import_message] = useState('');
  const [expanded_exercise_key, set_expanded_exercise_key] = useState('');
  const [archived_groups, set_archived_groups] = useState([]);
  const [hydrated_date, set_hydrated_date] = useState('');
  const [save_status, set_save_status] = useState('');
  const [save_error, set_save_error] = useState('');
  const api_revision = `${resource_revision}:${catalog_revision}`;
  const exercise_api_revision = `${api_revision}:${research_revision}`;
  const log_resource = useApiResource(`/sessions/by-date/${selected_date}/sets`, api_revision, on_unauthorized);
  const exercises = useApiResource(`/exercises?before_date=${selected_date}`, exercise_api_revision, on_unauthorized);
  const hydrated_date_ref = useRef('');
  const hydrated_catalog_revision_ref = useRef(catalog_revision);
  const selected_date_ref = useRef(selected_date);
  selected_date_ref.current = selected_date;
  const pending_save_ref = useRef(null);
  const save_timer_ref = useRef(null);
  const save_active_ref = useRef(null);
  const draft_revision_ref = useRef(0);
  const refreshed_today_dates_ref = useRef(new Set());
  const retry_counts_by_date_ref = useRef(new Map());

  useEffect(() => {
    if (initial_date_applied_ref.current || !initial_workout_date) return;
    initial_date_applied_ref.current = true;
    set_selected_date(initial_workout_date);
  }, [initial_workout_date]);

  useEffect(() => {
    set_area_import_is_open(false);
    set_research_exercise(null);
    set_import_message('');
  }, [selected_date, is_active]);

  const flush_save = () => {
    if (save_active_ref.current) return save_active_ref.current;
    if (!pending_save_ref.current) return Promise.resolve(true);
    const save_operation = save_pending();
    save_active_ref.current = save_operation;
    return save_operation;
  };

  const save_pending = async () => {
    const save_snapshot = pending_save_ref.current;
    pending_save_ref.current = null;
    if (selected_date_ref.current === save_snapshot.workout_date) {
      set_save_status(t("저장 중…"));
      set_save_error(save_snapshot.draft_is_stored ? '' : t("기기에 임시 보관할 수 없어 서버 저장을 기다리는 중입니다."));
    }
    let did_save = false;
    try {
      const saved_log = await api_request(`/sessions/by-date/${save_snapshot.workout_date}/sets`, {
        method: 'PUT',
        body: { exercise_groups: save_snapshot.normalized_groups },
      });
      did_save = true;
      window.dispatchEvent(new CustomEvent('workout-log-saved', {
        detail: { workout_date: save_snapshot.workout_date },
      }));
      if (save_snapshot.revision === draft_revision_ref.current
        && selected_date_ref.current === save_snapshot.workout_date) {
        const saved_groups = saved_log.exercise_groups || [];
        set_archived_groups(saved_groups.filter((group) => group.exercise_source === 'custom' && group.exercise_id === null));
        set_exercise_groups(saved_groups
          .filter((group) => group.exercise_id !== null)
          .map((group) => ({
            ...exercise_groups_ref.current.find((current_group) => exercise_key_for(current_group) === exercise_key_for(group)),
            exercise_source: group.exercise_source,
            exercise_id: group.exercise_id,
            exercise_name: group.exercise_name,
            sets: group.sets,
          })));
      }
      try {
        if (window.localStorage.getItem(save_snapshot.storage_key) === save_snapshot.draft_json) {
          window.localStorage.removeItem(save_snapshot.storage_key);
        }
      } catch {}
      if (save_snapshot.workout_date === current_workout_date(timezone)
        && !refreshed_today_dates_ref.current.has(save_snapshot.workout_date)) {
        refreshed_today_dates_ref.current.add(save_snapshot.workout_date);
        on_saved();
      }
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      let snapshot_is_current = false;
      try {
        snapshot_is_current = window.localStorage.getItem(save_snapshot.storage_key) === save_snapshot.draft_json;
      } catch {}
      if (snapshot_is_current || !save_snapshot.draft_is_stored) {
        const retry_count = Math.min(3, save_snapshot.retry_count + 1);
        retry_counts_by_date_ref.current.set(save_snapshot.workout_date, retry_count);
        if (snapshot_is_current) {
          try {
            window.localStorage.setItem(save_snapshot.storage_key, JSON.stringify({
              workout_date: save_snapshot.workout_date,
              exercise_groups: save_snapshot.raw_groups,
              retry_count,
            }));
          } catch {}
        }
        if (save_snapshot.revision === draft_revision_ref.current && selected_date_ref.current === save_snapshot.workout_date) {
          const retry_message = !save_snapshot.draft_is_stored
            ? t("기기에 임시 보관할 수 없습니다.")
            : retry_count >= 3
              ? t("저장 시도가 끝났습니다. 세트는 기기에 임시 보관되어 있습니다.")
              : t("다시 저장할 수 있습니다 ({0}회 남음).", [3 - retry_count]);
          set_save_error(`${error.message || t("저장에 실패했습니다.")} ${retry_message}`);
          set_save_status(t("기기에 임시 보관됨"));
        }
      }
    } finally {
      save_active_ref.current = null;
    }
    if (pending_save_ref.current) {
      return flush_save();
    } else if (did_save && save_snapshot.revision === draft_revision_ref.current
      && selected_date_ref.current === save_snapshot.workout_date) {
      set_save_status(t("저장 완료"));
      set_save_error('');
    }
    return did_save;
  };

  const queue_save = (workout_date, next_groups, delay_ms = 350, is_retry = false) => {
    const retry_count = is_retry ? (retry_counts_by_date_ref.current.get(workout_date) || 0) : 0;
    if (is_retry && retry_count >= 3) return;
    retry_counts_by_date_ref.current.set(workout_date, retry_count);
    const revision = ++draft_revision_ref.current;
    const storage_key = storage_key_for(user_uuid, workout_date);
    const draft_json = JSON.stringify({ workout_date, exercise_groups: next_groups, retry_count });
    let draft_is_stored = true;
    try {
      window.localStorage.setItem(storage_key, draft_json);
    } catch {
      draft_is_stored = false;
      set_save_error(t("기기에 임시 보관할 수 없습니다. 네트워크가 연결되어 있는지 확인해 주세요."));
    }
    const normalized_groups = normalize_groups(next_groups);
    if (save_timer_ref.current) clearTimeout(save_timer_ref.current);
    pending_save_ref.current = normalized_groups ? {
      workout_date, normalized_groups, storage_key, draft_json, revision, retry_count, raw_groups: next_groups,
      draft_is_stored,
    } : null;
    if (workout_date === selected_date) {
      set_save_status(normalized_groups ? t("저장 대기 중…") : t("입력한 세트가 완성되면 저장합니다."));
      if (normalized_groups && draft_is_stored) set_save_error('');
    }
    if (normalized_groups) {
      save_timer_ref.current = setTimeout(() => { void flush_save(); }, delay_ms);
    }
  };

  useImperativeHandle(ref, () => ({
    async prepare_checkin(workout_date) {
      if (selected_date_ref.current === workout_date) {
        if (hydrated_date_ref.current !== workout_date) {
          throw new Error(t('오늘 운동 기록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.'));
        }
        if (!normalize_groups(exercise_groups_ref.current)) {
          throw new Error(t('중량과 반복 횟수를 모두 입력한 뒤 다시 저장해 주세요.'));
        }
      }
      if (save_timer_ref.current) clearTimeout(save_timer_ref.current);
      const did_save = await flush_save();
      if (selected_date_ref.current === workout_date && !normalize_groups(exercise_groups_ref.current)) {
        throw new Error(t('중량과 반복 횟수를 모두 입력한 뒤 다시 저장해 주세요.'));
      }
      if (!did_save || read_saved_draft(storage_key_for(user_uuid, workout_date))) {
        throw new Error(t('오늘 운동 기록의 저장이 완료되지 않았습니다. 운동 세트 기록에서 저장 상태를 확인해 주세요.'));
      }
    },
  }));

  useEffect(() => {
    if (log_resource.loading || exercises.loading
      || log_resource.loaded_revision !== api_revision
      || exercises.loaded_revision !== exercise_api_revision
      || log_resource.data?.workout_date !== selected_date) return;
    const date_needs_hydration = hydrated_date_ref.current !== selected_date;
    const catalog_changed = hydrated_catalog_revision_ref.current !== catalog_revision;
    if (!date_needs_hydration && !catalog_changed) return;
    const storage_key = storage_key_for(user_uuid, selected_date);
    const saved_draft = read_saved_draft(storage_key);
    hydrated_date_ref.current = selected_date;
    hydrated_catalog_revision_ref.current = catalog_revision;
    set_hydrated_date(selected_date);
    const server_groups = log_resource.data.exercise_groups || [];
    set_archived_groups(server_groups.filter((group) => group.exercise_source === 'custom' && group.exercise_id === null));
    const editable_server_groups = server_groups
      .filter((group) => group.exercise_id !== null)
      .map((group) => ({
        exercise_source: group.exercise_source,
        exercise_id: group.exercise_id,
        exercise_name: group.exercise_name,
        sets: group.sets,
      }));
    const hydrated_groups = saved_draft?.groups || editable_server_groups;
    set_exercise_groups(hydrated_groups);
    set_expanded_exercise_key(exercise_key_for(hydrated_groups.at(-1)));
    set_save_error('');
    if (saved_draft) {
      const normalized_groups = normalize_groups(saved_draft.groups);
      retry_counts_by_date_ref.current.set(selected_date, saved_draft.retry_count);
      if (normalized_groups) {
        if (saved_draft.retry_count > 0) {
          set_save_status(t("기기에 임시 보관됨"));
          set_save_error(saved_draft.retry_count >= 3
            ? t("저장 시도 한도에 도달했습니다. 기록을 수정하면 다시 저장할 수 있습니다.")
            : t("저장이 완료되지 않았습니다. 다시 저장 버튼으로 재시도해 주세요."));
        } else {
          const revision = ++draft_revision_ref.current;
          pending_save_ref.current = {
            workout_date: selected_date,
            normalized_groups,
            storage_key,
            draft_json: saved_draft.raw,
            revision,
            retry_count: saved_draft.retry_count,
            raw_groups: saved_draft.groups,
            draft_is_stored: true,
          };
          set_save_status(t("임시 기록을 서버에 저장 중…"));
          void flush_save();
        }
      } else {
        set_save_status(t("완성되지 않은 입력을 기기에 임시 보관했습니다."));
      }
    } else {
      set_save_status('');
    }
  }, [log_resource.data, log_resource.loading, exercises.loading, selected_date, user_uuid, catalog_revision]);

  const change_groups = (next_groups, preferred_exercise_key = null) => {
    exercise_groups_ref.current = next_groups;
    set_exercise_groups(next_groups);
    set_expanded_exercise_key((current_exercise_key) => {
      if (preferred_exercise_key !== null) return preferred_exercise_key;
      return next_groups.some((group) => exercise_key_for(group) === current_exercise_key)
        ? current_exercise_key
        : exercise_key_for(next_groups.at(-1));
    });
    queue_save(selected_date, next_groups);
  };
  const import_area_exercises = (import_result) => {
    if (import_result.workout_date !== selected_date_ref.current || hydrated_date !== selected_date || !is_active) {
      return { error_message: t('기록 날짜가 변경되었습니다. 다시 불러와 주세요.') };
    }
    const current_groups = exercise_groups_ref.current;
    const selected_exercise_keys = new Set(current_groups.map(exercise_key_for));
    const catalog_exercise_keys = new Set(exercises.data.map(exercise_key_for));
    const new_groups = import_result.exercise_groups.filter((group) =>
      !selected_exercise_keys.has(exercise_key_for(group)) && catalog_exercise_keys.has(exercise_key_for(group)));
    if (!new_groups.length) {
      return { info_message: t('추가할 종목이 없습니다. 이미 추가되었거나 삭제된 종목입니다.') };
    }
    if (current_groups.length + new_groups.length > 30) {
      return { error_message: t('종목을 모두 추가하려면 {0}개의 빈자리가 필요합니다. 현재 남은 자리는 {1}개입니다.', [new_groups.length, Math.max(0, 30 - current_groups.length)]) };
    }
    const imported_groups = new_groups.map((group) => ({
      exercise_source: group.exercise_source,
      exercise_id: group.exercise_id,
      exercise_name: group.exercise_name,
      sets: group.sets.map((workout_set) => ({ ...workout_set })),
      import_record: {
        workout_date: group.source_workout_date,
        session_count: group.session_count,
        sets: group.sets.map((workout_set) => ({ ...workout_set })),
      },
    }));
    change_groups([...current_groups, ...imported_groups], exercise_key_for(imported_groups[0]));
    window.requestAnimationFrame(() => {
      const first_group = imported_groups[0];
      document.getElementById(`workout-group-${first_group.exercise_source}-${first_group.exercise_id}`)
        ?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    });
    const existing_count = import_result.exercise_groups.filter((group) => selected_exercise_keys.has(exercise_key_for(group))).length;
    set_import_message(t('{0}개 추가 · {1}개 이미 있음', [imported_groups.length, existing_count]));
    return {};
  };
  const add_exercise = (exercise) => {
    const exercise_key = `${exercise.exercise_source}:${exercise.exercise_id}`;
    if (exercise_groups.length >= 30 || exercise_groups.some(
      (group) => `${group.exercise_source}:${group.exercise_id}` === exercise_key,
    )) return;
    const next_groups = [...exercise_groups, {
      exercise_source: exercise.exercise_source,
      exercise_id: exercise.exercise_id,
      exercise_name: exercise.name,
      sets: exercise.last_sets.length
        ? exercise.last_sets.map((workout_set) => ({ ...workout_set }))
        : [{ weight_kg: 0, reps: 8 }],
    }];
    change_groups(next_groups, exercise_key);
    window.requestAnimationFrame(() => {
      document.getElementById(`workout-group-${exercise.exercise_source}-${exercise.exercise_id}`)
        ?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    });
  };
  const retry_save = () => {
    if (!normalize_groups(exercise_groups)) {
      set_save_error(t("중량과 반복 횟수를 모두 입력한 뒤 다시 저장해 주세요."));
      return;
    }
    queue_save(selected_date, exercise_groups, 0, true);
  };

  return <section className={'viewPanel workoutLogPanel' + (is_active ? ' isVisible' : '')}>
    <header className="pageHeader"><div><p className="eyebrow">{t('성장 욕심이 있다면 일단 남겨봐.')}</p><h1>{t('들었으면,\n기록으로 남겨봐.')}</h1></div></header>
    <div className="workoutDatePicker">
      <label className="fieldLabel" htmlFor="workout-record-date">{t("기록 날짜")}</label>
      <input id="workout-record-date" className="timeInput" type="date" value={selected_date} max={current_workout_date(timezone)} onChange={(event) => {
        if (!event.target.value) return;
        set_selected_date(event.target.value);
        set_save_status('');
        set_save_error('');
      }} />
    </div>
    <div className="workoutSaveMessage" role="status" aria-live="polite">
      <span>{localize_message(save_status) || t("입력을 시작하면 자동으로 저장됩니다.")}</span>
      {save_error && <div className="workoutSaveError" role="alert"><span>{localize_message(save_error)}</span>{(retry_counts_by_date_ref.current.get(selected_date) || 0) < 3 && <button className="textButton" type="button" onClick={retry_save}>{t("다시 저장")}</button>}</div>}
    </div>
    <RequestState loading={log_resource.loading || exercises.loading} error={log_resource.error || exercises.error} on_retry={() => set_resource_revision((value) => value + 1)} />
    {log_resource.data && exercises.data && hydrated_date === selected_date && <>
      {import_message && <p className="workoutImportResult" role="status">{localize_message(import_message)}</p>}
      <WorkoutSetBuilder
        exercises={exercises.data}
        exercise_groups={exercise_groups}
        expanded_exercise_key={expanded_exercise_key}
        on_change={change_groups}
        on_open_area_import={() => set_area_import_is_open(true)}
        on_open_research={set_research_exercise}
        on_toggle_exercise={(exercise_key) => set_expanded_exercise_key(
          (current_exercise_key) => current_exercise_key === exercise_key ? '' : exercise_key,
        )}
        disabled={false}
      />
      <WorkoutFloatingActions exercises={exercises.data} exercise_groups={exercise_groups} on_add_exercise={add_exercise} on_open_library={on_open_library} />
      {is_active && <AreaWorkoutImportModal is_open={area_import_is_open} workout_date={selected_date} on_import={import_area_exercises} on_close={() => set_area_import_is_open(false)} on_unauthorized={on_unauthorized} />}
    </>}
    {is_active && research_exercise && <ExerciseResearchModal key={exercise_key_for(research_exercise)} exercise={research_exercise} on_change={on_research_change} on_close={() => set_research_exercise(null)} on_unauthorized={on_unauthorized} />}
    {archived_groups.length > 0 && <section className="workoutBuilder" aria-labelledby="archived-workout-heading">
      <div><h2 id="archived-workout-heading">{t("삭제한 종목의 기록")}</h2><p className="infoText">{t("종목을 삭제해도 저장된 세트 기록은 남습니다.")}</p></div>
      {archived_groups.map((group, group_index) => <article className="workoutGroup" key={`${group.exercise_name}:${group_index}`}>
        <strong>{group.exercise_name}</strong>
        <p className="infoText">{group.sets.map((workout_set) => t("{0}kg × {1}회", [workout_set.weight_kg, workout_set.reps])).join(' · ')}</p>
      </article>)}
    </section>}
    <div className="workoutFooter"><button className="wideButton primary" type="button" onClick={on_open_checkin}><MaterialIcon>photo_camera</MaterialIcon>{t('오늘 운동, 출석으로 마무리')}</button></div>
  </section>;
}
