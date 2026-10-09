'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api_request } from '../../_lib/api';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';

function create_request_id() {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function format_duration(total_seconds) {
  const hours = Math.floor(total_seconds / 3600);
  const minutes = Math.floor((total_seconds % 3600) / 60);
  const seconds = total_seconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

export default function WorkoutTimer({ user_uuid, is_active, on_unauthorized }) {
  const { t, localize_message } = useLanguage();
  const [timer, set_timer] = useState(null);
  const [refresh_token, set_refresh_token] = useState(0);
  const [server_clock_offset, set_server_clock_offset] = useState(0);
  const [current_time, set_current_time] = useState(Date.now());
  const [is_online, set_is_online] = useState(true);
  const [pending, set_pending] = useState(false);
  const [has_pending_intent, set_has_pending_intent] = useState(false);
  const [error_message, set_error_message] = useState('');
  const [correction_seconds, set_correction_seconds] = useState(0);
  const [correction_reason, set_correction_reason] = useState('');
  const storage_key = useMemo(() => `workout_timer_snapshot_${user_uuid}`, [user_uuid]);
  const pending_key = useMemo(() => `workout_timer_pending_${user_uuid}`, [user_uuid]);

  const update_timer = useCallback((next_timer) => {
    set_timer(next_timer);
    if (!next_timer || ['finished', 'discarded'].includes(next_timer.status)) {
      localStorage.removeItem(storage_key);
      return;
    }
    localStorage.setItem(storage_key, JSON.stringify(next_timer));
  }, [storage_key]);

  const sync_pending_action = useCallback(async () => {
    if (!navigator.onLine) return;
    const saved_intent = localStorage.getItem(pending_key);
    if (!saved_intent) {
      set_has_pending_intent(false);
      return;
    }
    set_has_pending_intent(true);
    let intent;
    try {
      intent = JSON.parse(saved_intent);
    } catch {
      localStorage.removeItem(pending_key);
      set_has_pending_intent(false);
      set_error_message(t('저장된 타이머 요청을 읽지 못했습니다. 현재 상태를 다시 확인해 주세요.'));
      return;
    }
    try {
      const { timer_uuid, ...request_body } = intent;
      const result = await api_request(`/workout-timers/${timer_uuid}/reconcile`, {
        method: 'POST',
        body: request_body,
      });
      localStorage.removeItem(pending_key);
      set_has_pending_intent(false);
      update_timer(result);
      set_correction_seconds(result.measured_seconds);
      set_correction_reason(t('네트워크 복구 후 운동 시간을 확인했습니다.'));
      set_error_message('');
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
    }
  }, [localize_message, on_unauthorized, pending_key, t, update_timer]);

  useEffect(() => {
    const refresh_timer = () => set_refresh_token((value) => value + 1);
    window.addEventListener('workout-timer-changed', refresh_timer);
    return () => window.removeEventListener('workout-timer-changed', refresh_timer);
  }, []);

  useEffect(() => {
    if (!is_active) return undefined;
    const controller = new AbortController();
    try {
      const saved_timer = localStorage.getItem(storage_key);
      if (saved_timer) {
        const cached_timer = JSON.parse(saved_timer);
        set_timer(cached_timer);
        if (cached_timer.server_now) set_server_clock_offset(Date.parse(cached_timer.server_now) - Date.now());
      }
    } catch {
      localStorage.removeItem(storage_key);
    }
    api_request('/workout-timers/current', { signal: controller.signal })
      .then(({ timer: current_timer, server_now }) => {
        if (controller.signal.aborted) return;
        set_server_clock_offset(Date.parse(server_now) - Date.now());
        update_timer(current_timer);
        if (current_timer?.status === 'needs_review') {
          set_correction_seconds(current_timer.measured_seconds);
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) on_unauthorized();
        else set_error_message(localize_message(error.message));
      });
    return () => controller.abort();
  }, [is_active, localize_message, on_unauthorized, refresh_token, storage_key, update_timer]);

  useEffect(() => {
    if (!is_active) return undefined;
    const handle_online = () => sync_pending_action();
    window.addEventListener('online', handle_online);
    sync_pending_action();
    return () => window.removeEventListener('online', handle_online);
  }, [is_active, sync_pending_action]);

  useEffect(() => {
    if (!is_active) return undefined;
    const clock_timer = setInterval(() => set_current_time(Date.now()), 1000);
    return () => clearInterval(clock_timer);
  }, [is_active]);

  useEffect(() => {
    const update_connection = () => set_is_online(navigator.onLine);
    update_connection();
    window.addEventListener('online', update_connection);
    window.addEventListener('offline', update_connection);
    return () => {
      window.removeEventListener('online', update_connection);
      window.removeEventListener('offline', update_connection);
    };
  }, []);

  const shown_seconds = useMemo(() => {
    if (!timer) return 0;
    if (timer.status !== 'running' || !timer.active_segment_started_at) return timer.measured_seconds;
    const estimated_server_now = current_time + server_clock_offset;
    return timer.measured_seconds + Math.max(
      Math.floor((estimated_server_now - Date.parse(timer.active_segment_started_at)) / 1000),
      0,
    );
  }, [current_time, server_clock_offset, timer]);

  const start_timer = async () => {
    if (pending) return;
    set_pending(true);
    set_error_message('');
    try {
      const result = await api_request('/workout-timers', {
        method: 'POST',
        body: { request_id: create_request_id() },
      });
      set_server_clock_offset(Date.parse(result.server_now) - Date.now());
      update_timer(result);
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
    } finally {
      set_pending(false);
    }
  };

  const store_offline_intent = (action, request_id = create_request_id()) => {
    const intent = {
      action,
      request_id,
      expected_revision: timer.revision,
      client_action_at: new Date().toISOString(),
      timer_uuid: timer.timer_uuid,
    };
    localStorage.setItem(pending_key, JSON.stringify(intent));
    set_has_pending_intent(true);
    const local_timer = {
      ...timer,
      status: 'needs_review',
      active_segment_started_at: null,
      measured_seconds: shown_seconds,
      needs_review_reason: t('네트워크 복구 후 시간을 확인합니다.'),
    };
    update_timer(local_timer);
  };

  const act_timer = async (action) => {
    if (!timer || pending) return;
    const request_id = create_request_id();
    if (!navigator.onLine && ['pause', 'finish'].includes(action)) {
      store_offline_intent(action, request_id);
      return;
    }
    set_pending(true);
    set_error_message('');
    try {
      const result = await api_request(`/workout-timers/${timer.timer_uuid}/actions`, {
        method: 'POST',
        body: { action, request_id, expected_revision: timer.revision },
      });
      update_timer(result);
      if (result.status === 'needs_review') set_correction_seconds(result.measured_seconds);
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else if (['pause', 'finish'].includes(action) && (error.status === 0 || !is_online)) {
        store_offline_intent(action, request_id);
      } else {
        set_error_message(localize_message(error.message));
      }
    } finally {
      set_pending(false);
    }
  };

  const confirm_correction = async () => {
    if (!timer || pending) return;
    set_pending(true);
    set_error_message('');
    try {
      const result = await api_request(`/workout-timers/${timer.timer_uuid}/corrections`, {
        method: 'POST',
        body: {
          measured_seconds: Number(correction_seconds),
          reason: correction_reason,
        },
      });
      update_timer(result);
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
    } finally {
      set_pending(false);
    }
  };

  const discard_timer = () => act_timer('discard');
  const can_discard = timer && ['running', 'paused', 'needs_review'].includes(timer.status);
  const status_message = timer?.status === 'running'
    ? t('운동 시간을 측정 중입니다.')
    : timer?.status === 'paused'
      ? t('측정이 일시정지되었습니다.')
      : timer?.status === 'needs_review'
        ? t('시간 확인이 필요합니다. 확인 전에는 기록에 반영되지 않습니다.')
        : timer?.status === 'finished'
          ? t('운동 시간 기록을 저장했습니다.')
          : t('운동 시작과 종료 시각으로 시간을 측정합니다.');

  return <article className="workoutTimerCard">
    <div className="sectionHeading"><h2>{t('운동 시간')}</h2>{timer?.record_source === 'self_reported' && <span className="challengeStatus">{t('사용자 확인 기록')}</span>}</div>
    <div className="workoutTimerReadout" aria-live="off">{format_duration(shown_seconds)}</div>
    <p className="infoText">{status_message}</p>
    {error_message && <p className="timerError" role="alert">{error_message}</p>}
    {timer?.status === 'needs_review' && <div className="challengeForm workoutTimerCorrection">
      <label>{t('확인한 운동 시간 (초)')}<input type="number" min="0" max="86400" step="1" inputMode="numeric" value={correction_seconds} onChange={(event) => set_correction_seconds(event.target.value)} /></label>
      <label>{t('보정 사유')}<input value={correction_reason} maxLength={500} onChange={(event) => set_correction_reason(event.target.value)} /></label>
      <button className="wideButton primary" type="button" disabled={pending || !is_online || has_pending_intent || !correction_reason.trim()} onClick={confirm_correction}>{t('확인한 시간으로 저장')}</button>
      <button className="textButton" type="button" disabled={pending || has_pending_intent} onClick={discard_timer}>{t('이 측정 제외')}</button>
    </div>}
    {!timer || ['finished', 'discarded'].includes(timer.status) ? <button className="wideButton primary" type="button" disabled={pending || !is_online} onClick={start_timer}><MaterialIcon>play_arrow</MaterialIcon>{pending ? t('시작 중…') : t('운동 시작')}</button> : timer.status !== 'needs_review' && <div className="workoutTimerActions">
      {timer.status === 'running' && <button className="textButton" type="button" disabled={pending} onClick={() => act_timer('pause')}><MaterialIcon>pause</MaterialIcon>{t('일시정지')}</button>}
      {timer.status === 'paused' && <button className="textButton" type="button" disabled={pending || !is_online} onClick={() => act_timer('resume')}><MaterialIcon>play_arrow</MaterialIcon>{t('재개')}</button>}
      <button className="wideButton primary" type="button" disabled={pending} onClick={() => act_timer('finish')}><MaterialIcon>stop</MaterialIcon>{t('운동 종료')}</button>
      {can_discard && <button className="quietButton" type="button" disabled={pending} onClick={discard_timer}>{t('잘못 시작했어요')}</button>}
    </div>}
  </article>;
}
