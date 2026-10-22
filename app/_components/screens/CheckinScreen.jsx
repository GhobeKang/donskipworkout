import { useLanguage } from '../../_hooks/useLanguage';
import { useState } from 'react';
import MaterialIcon from '../ui/MaterialIcon';
import useApiResource from '../../_hooks/useApiResource';
import PhotoComposer from '../checkin/PhotoComposer';
import SavedPhoto from '../checkin/SavedPhoto';
import RequestState from '../ui/RequestState';
import { create_submission_id } from '../../_lib/photo';

export default function CheckinScreen({ session, workout_date, pending, on_back, on_open_workout, on_complete, on_photo_complete, on_unauthorized }) {
  const { t } = useLanguage();
  const [note, set_note] = useState('');
  const [photo_selection, set_photo_selection] = useState(null);
  const [catalog_revision, set_catalog_revision] = useState(0);
  const catalog = useApiResource('/photo-effects', catalog_revision, on_unauthorized);
  const is_finished = ['completed', 'rest', 'missed'].includes(session?.session_status);

  const submit_photo = async (event) => {
    event.preventDefault();
    if (pending || is_finished || !photo_selection || !catalog.data) return;
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
    await on_photo_complete(upload_body);
  };

  return <section className="viewPanel isVisible">
    <header className="pageHeader checkinHeader"><button className="backButton" type="button" onClick={on_back} disabled={pending} aria-label={t("오늘 화면으로 돌아가기")}><MaterialIcon>arrow_back</MaterialIcon></button><div><p className="eyebrow">{t('왔다면, 흔적을 남겨.')}</p><h1>{t('출석 도장, 쾅.')}</h1></div></header>
    {session?.photo_path && <SavedPhoto photo_path={session.photo_path} workout_date={session.workout_date || workout_date} />}
    {!is_finished && <>
      <RequestState loading={catalog.loading} error={catalog.error} on_retry={() => set_catalog_revision((value) => value + 1)} />
      {catalog.data && !catalog.error && <PhotoComposer key={`${workout_date}:${catalog_revision}`} catalog={catalog.data} workout_date={workout_date} disabled={pending} on_change={set_photo_selection} />}
    </>}
    <button className="textButton" type="button" onClick={on_open_workout} disabled={pending}>{t("운동 세트 기록 열기")}</button>
    {!is_finished && <form onSubmit={submit_photo}>
      <label className="fieldLabel" htmlFor="workout-note">{t("운동 메모 (선택)")}</label>
      <textarea className="timeInput" id="workout-note" rows={3} maxLength={1000} value={note} disabled={pending || is_finished} onChange={(event) => { set_note(event.target.value); set_photo_selection((current) => current ? { ...current, submission_id: create_submission_id() } : null); }} placeholder={t("오늘 어떤 운동을 했나요?")} />
      <p className="infoText">{note.length}{t(" / 1000자")}</p>
      <button className="wideButton primary" type="submit" disabled={pending || is_finished || !photo_selection || catalog.loading || Boolean(catalog.error)}>{pending ? t("사진 검증·저장 중…") : is_finished ? session.status : t("사진으로 출석 완료")}</button>
      {!is_finished && <button className="textButton photoManual" type="button" disabled={pending} onClick={() => on_complete(note.trim())}>{t("사진 없이 수동 출석")}</button>}
    </form>}
    {session?.session_status === 'completed' && <div className="checkinSuccess" role="status"><MaterialIcon>check_circle</MaterialIcon><h2>{t('오늘 핑계는 결석이다.')}</h2><p>{t("오늘 출석이 저장되어 있습니다.")}</p><button className="quietButton" type="button" onClick={on_back}>{t('오늘 화면으로 돌아가기')}</button></div>}
    {is_finished && session?.session_status !== 'completed' && <p className="emptyState" role="status">{session.status}{t(' · 오늘의 출석 상태가 확정되어 있습니다.')}</p>}
  </section>;
}
