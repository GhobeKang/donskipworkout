import { useLanguage } from '../../_hooks/useLanguage';
import { useEffect, useRef, useState } from 'react';
import MaterialIcon from '../ui/MaterialIcon';
import useApiResource from '../../_hooks/useApiResource';
import PhotoComposer from '../checkin/PhotoComposer';
import SavedPhoto from '../checkin/SavedPhoto';
import RequestState from '../ui/RequestState';
import { create_submission_id } from '../../_lib/photo';
import { api_request } from '../../_lib/api';
import HelpLink from '../help/HelpLink';
import ActionModal from '../ui/ActionModal';

const checkin_timer_content = {
  icon: 'timer',
  eyebrow: '출석 저장 완료',
  title: '운동 시간도 종료할까요?',
  message: '출석은 저장되었습니다. 아직 운동 중이라면 시간 측정을 유지하세요.',
  detail: '운동 종료를 선택할 때만 타이머를 종료하고 시간을 저장합니다.',
  confirm_label: '운동 종료',
  cancel_label: '계속 운동하기',
  pending_label: '운동 시간 저장 중…',
};

export default function CheckinScreen({ session, workout_date, pending, on_back, on_open_workout, on_complete, on_photo_complete, on_unauthorized }) {
  const { t, localize_message } = useLanguage();
  const [note, set_note] = useState('');
  const [photo_selection, set_photo_selection] = useState(null);
  const [catalog_revision, set_catalog_revision] = useState(0);
  const [timer_to_finish, set_timer_to_finish] = useState(null);
  const [timer_pending, set_timer_pending] = useState(false);
  const [timer_error, set_timer_error] = useState('');
  const [timer_finish_attempts, set_timer_finish_attempts] = useState(0);
  const timer_request_ref = useRef(null);
  const catalog = useApiResource('/photo-effects', catalog_revision, on_unauthorized);
  const is_finished = ['completed', 'missed'].includes(session?.session_status);
  const checkin_pending = pending || timer_pending;

  useEffect(() => () => timer_request_ref.current?.abort(), []);

  const save_checkin_and_confirm_timer = async (save_checkin) => {
    if (checkin_pending || timer_request_ref.current || is_finished) return;
    const controller = new AbortController();
    timer_request_ref.current = controller;
    set_timer_pending(true);
    set_timer_error('');
    try {
      const checkin_saved = await save_checkin();
      if (!checkin_saved || controller.signal.aborted) return;
      const { timer } = await api_request('/workout-timers/current', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (['running', 'paused'].includes(timer?.status)) {
        set_timer_to_finish({ ...timer, request_id: create_submission_id() });
        set_timer_finish_attempts(0);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.status === 401) on_unauthorized();
      else set_timer_error(error.message);
    } finally {
      timer_request_ref.current = null;
      if (!controller.signal.aborted) set_timer_pending(false);
    }
  };

  const submit_photo = async (event) => {
    event.preventDefault();
    if (checkin_pending || timer_request_ref.current || is_finished || !photo_selection || !catalog.data) return;
    const upload_body = new FormData();
    upload_body.append('photo', photo_selection.photo_blob, 'workout.jpg');
    upload_body.append('captured_at', photo_selection.captured_at);
    upload_body.append('capture_timezone', photo_selection.capture_timezone);
    upload_body.append('workout_summary_hash', photo_selection.workout_summary_hash);
    upload_body.append('branding_language', photo_selection.branding_language);
    upload_body.append('character_id', photo_selection.character_id);
    upload_body.append('filter_id', catalog.data.filter.filter_id);
    upload_body.append('effect_version', String(catalog.data.effect_version));
    upload_body.append('workout_date', workout_date);
    upload_body.append('submission_id', photo_selection.submission_id);
    upload_body.append('note', note.trim());
    await save_checkin_and_confirm_timer(() => on_photo_complete(upload_body));
  };

  const finish_checkin_timer = async () => {
    if (!timer_to_finish || checkin_pending || timer_request_ref.current || timer_finish_attempts >= 3) return;
    const controller = new AbortController();
    timer_request_ref.current = controller;
    set_timer_pending(true);
    set_timer_error('');
    set_timer_finish_attempts((count) => count + 1);
    try {
      const finished_timer = await api_request(`/workout-timers/${timer_to_finish.timer_uuid}/actions`, {
        method: 'POST', signal: controller.signal,
        body: { action: 'finish', request_id: timer_to_finish.request_id, expected_revision: timer_to_finish.revision },
      });
      if (controller.signal.aborted) return;
      window.dispatchEvent(new CustomEvent('workout-timer-updated', { detail: finished_timer }));
      set_timer_to_finish(null);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.status === 401) on_unauthorized();
      else set_timer_error(error.message);
    } finally {
      timer_request_ref.current = null;
      if (!controller.signal.aborted) set_timer_pending(false);
    }
  };

  return <section className="viewPanel isVisible">
    <header className="pageHeader checkinHeader"><button className="backButton" type="button" onClick={on_back} disabled={checkin_pending} aria-label={t("오늘 화면으로 돌아가기")}><MaterialIcon>arrow_back</MaterialIcon></button><div><p className="eyebrow">{t('왔다면, 흔적을 남겨.')}</p><h1>{t('출석 도장, 쾅.')}</h1></div></header>
    <HelpLink question_id="manual-checkin">{t('사진 인증과 수동 출석 방법 보기')}</HelpLink>
    {session?.photo_path && <SavedPhoto photo_path={session.photo_path} workout_date={session.workout_date || workout_date} />}
    {!is_finished && <>
      <RequestState loading={catalog.loading} error={catalog.error} on_retry={() => set_catalog_revision((value) => value + 1)} />
      {catalog.data && !catalog.error && <PhotoComposer key={`${workout_date}:${catalog_revision}`} catalog={catalog.data} workout_date={workout_date} disabled={checkin_pending} on_change={set_photo_selection} />}
    </>}
    <button className="textButton" type="button" onClick={on_open_workout} disabled={checkin_pending}>{t("운동 세트 기록 열기")}</button>
    {timer_pending && !pending && !timer_to_finish && <p className="infoText" role="status">{t('운동 시간 상태를 확인하고 있습니다…')}</p>}
    {timer_error && !timer_to_finish && <div className="requestState" role="alert"><p>{localize_message(timer_error)}</p><p>{t('오늘 화면에서 운동 타이머 상태를 확인해 주세요. 출석은 다시 저장할 필요가 없습니다.')}</p></div>}
    {!is_finished && <form onSubmit={submit_photo}>
      <label className="fieldLabel" htmlFor="workout-note">{t("운동 메모 (선택)")}</label>
      <textarea className="timeInput" id="workout-note" rows={3} maxLength={1000} value={note} disabled={checkin_pending || is_finished} onChange={(event) => { set_note(event.target.value); set_photo_selection((current) => current ? { ...current, submission_id: create_submission_id() } : null); }} placeholder={t("오늘 어떤 운동을 했나요?")} />
      <p className="infoText">{note.length}{t(" / 1000자")}</p>
      <button className="wideButton primary" type="submit" disabled={checkin_pending || is_finished || !photo_selection || catalog.loading || Boolean(catalog.error)}>{checkin_pending ? t("사진 검증·저장 중…") : is_finished ? session.status : t("사진으로 출석 완료")}</button>
      {!is_finished && <button className="textButton photoManual" type="button" disabled={checkin_pending} onClick={() => save_checkin_and_confirm_timer(() => on_complete(note.trim()))}>{t("사진 없이 수동 출석")}</button>}
    </form>}
    {session?.session_status === 'completed' && <div className="checkinSuccess" role="status"><MaterialIcon>check_circle</MaterialIcon><h2>{t('오늘 핑계는 결석이다.')}</h2><p>{t("오늘 출석이 저장되어 있습니다.")}</p><button className="quietButton" type="button" disabled={checkin_pending} onClick={on_back}>{t('오늘 화면으로 돌아가기')}</button></div>}
    {is_finished && session?.session_status !== 'completed' && <p className="emptyState" role="status">{session.status}{t(' · 오늘의 출석 상태가 확정되어 있습니다.')}</p>}
    {timer_to_finish && <ActionModal content={checkin_timer_content} initial_focus="cancel" pending={checkin_pending} confirm_disabled={timer_finish_attempts >= 3}
      on_confirm={finish_checkin_timer} on_close={() => set_timer_to_finish(null)}>
      {timer_error && <p className="errorText" role="alert">{localize_message(timer_error)}</p>}
      {timer_finish_attempts >= 3 && <p className="infoText">{t('운동 시간 종료를 다시 시도하려면 오늘 화면에서 타이머를 확인해 주세요.')}</p>}
    </ActionModal>}
  </section>;
}
