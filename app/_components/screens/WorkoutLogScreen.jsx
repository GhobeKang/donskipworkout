'use client';

import { useLanguage } from '../../_hooks/useLanguage';

import { useEffect, useRef, useState } from 'react';
import useApiResource from '../../_hooks/useApiResource';
import { api_request } from '../../_lib/api';
import WorkoutSetBuilder from '../workout/WorkoutSetBuilder';
import WorkoutFloatingActions from '../workout/WorkoutFloatingActions';
import MaterialIcon from '../ui/MaterialIcon';
import RequestState from '../ui/RequestState';

function seoul_date() {
  const date_parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const date_values = Object.fromEntries(date_parts.map(({ type, value }) => [type, value]));
  return `${date_values.year}-${date_values.month}-${date_values.day}`;
}

function storage_key_for(user_uuid, workout_date) {
  return `workout_set_draft:${user_uuid}:${workout_date}`;
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
      if (!Number.isFinite(weight_kg) || weight_kg < 0 || weight_kg > 999.99
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

export default function WorkoutLogScreen({ user_uuid, initial_workout_date, is_active, catalog_revision, on_unauthorized, on_open_library, on_open_checkin, on_saved }) {
  const { t, localize_message } = useLanguage();
  const [selected_date, set_selected_date] = useState(initial_workout_date || seoul_date());
  const [resource_revision, set_resource_revision] = useState(0);
  const [exercise_groups, set_exercise_groups] = useState([]);
  const [archived_groups, set_archived_groups] = useState([]);
  const [hydrated_date, set_hydrated_date] = useState('');
  const [save_status, set_save_status] = useState('');
  const [save_error, set_save_error] = useState('');
  const api_revision = `${resource_revision}:${catalog_revision}`;
  const log_resource = useApiResource(`/sessions/by-date/${selected_date}/sets`, api_revision, on_unauthorized);
  const exercises = useApiResource('/exercises', api_revision, on_unauthorized);
  const hydrated_date_ref = useRef('');
  const hydrated_catalog_revision_ref = useRef(catalog_revision);
  const selected_date_ref = useRef(selected_date);
  selected_date_ref.current = selected_date;
  const pending_save_ref = useRef(null);
  const save_timer_ref = useRef(null);
  const save_active_ref = useRef(false);
  const draft_revision_ref = useRef(0);
  const refreshed_today_dates_ref = useRef(new Set());
  const retry_counts_by_date_ref = useRef(new Map());

  const flush_save = async () => {
    if (save_active_ref.current || !pending_save_ref.current) return;
    const save_snapshot = pending_save_ref.current;
    pending_save_ref.current = null;
    save_active_ref.current = true;
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
      if (save_snapshot.revision === draft_revision_ref.current
        && selected_date_ref.current === save_snapshot.workout_date) {
        const saved_groups = saved_log.exercise_groups || [];
        set_archived_groups(saved_groups.filter((group) => group.exercise_source === 'custom' && group.exercise_id === null));
        set_exercise_groups(saved_groups
          .filter((group) => group.exercise_id !== null)
          .map((group) => ({
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
      if (save_snapshot.workout_date === seoul_date()
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
      save_active_ref.current = false;
    }
    if (pending_save_ref.current) {
      void flush_save();
    } else if (did_save && save_snapshot.revision === draft_revision_ref.current
      && selected_date_ref.current === save_snapshot.workout_date) {
      set_save_status(t("저장 완료"));
      set_save_error('');
    }
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

  useEffect(() => {
    if (log_resource.loading || exercises.loading
      || log_resource.loaded_revision !== api_revision
      || exercises.loaded_revision !== api_revision
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
    set_exercise_groups(saved_draft?.groups || editable_server_groups);
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

  const change_groups = (next_groups) => {
    set_exercise_groups(next_groups);
    queue_save(selected_date, next_groups);
  };
  const add_exercise = (exercise) => {
    const exercise_key = `${exercise.exercise_source}:${exercise.exercise_id}`;
    if (exercise_groups.length >= 30 || exercise_groups.some(
      (group) => `${group.exercise_source}:${group.exercise_id}` === exercise_key,
    )) return;
    change_groups([...exercise_groups, {
      exercise_source: exercise.exercise_source,
      exercise_id: exercise.exercise_id,
      exercise_name: exercise.name,
      sets: exercise.last_sets.length
        ? exercise.last_sets.map((workout_set) => ({ ...workout_set }))
        : [{ weight_kg: 0, reps: 8 }],
    }]);
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
      <input id="workout-record-date" className="timeInput" type="date" value={selected_date} max={seoul_date()} onChange={(event) => {
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
      <WorkoutSetBuilder exercises={exercises.data} exercise_groups={exercise_groups} on_change={change_groups} disabled={false} />
      <WorkoutFloatingActions exercises={exercises.data} exercise_groups={exercise_groups} on_add_exercise={add_exercise} on_open_library={on_open_library} />
    </>}
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
