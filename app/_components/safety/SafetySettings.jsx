'use client';

import { useState } from 'react';
import { api_request } from '../../_lib/api';
import useApiResource from '../../_hooks/useApiResource';
import { useLanguage } from '../../_hooks/useLanguage';
import RequestState from '../ui/RequestState';
import SafetyDialog from './SafetyDialog';
import safety_styles from './Safety.module.css';

function ModerationQueue({ on_unauthorized }) {
  const { t, localize_message } = useLanguage();
  const [revision, set_revision] = useState(0);
  const [status, set_status] = useState('open');
  const [cursor, set_cursor] = useState(null);
  const [selected_report, set_selected_report] = useState(null);
  const [action, set_action] = useState('remove_content');
  const [note, set_note] = useState('');
  const [pending, set_pending] = useState(false);
  const [error_message, set_error_message] = useState('');
  const reports = useApiResource(`/moderation/reports?status=${status}${cursor ? `&before_id=${cursor}` : ''}`, revision, on_unauthorized);
  const resolve_report = async (event) => {
    event.preventDefault();
    if (pending || !note.trim()) return;
    set_pending(true); set_error_message('');
    try {
      await api_request(`/moderation/reports/${selected_report.report_uuid}/resolve`, { method: 'POST', body: { action, note: note.trim() } });
      set_selected_report(null); set_note(''); set_revision((value) => value + 1);
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
    } finally { set_pending(false); }
  };
  const retry_cleanup = async () => {
    if (pending) return;
    set_pending(true); set_error_message('');
    try {
      await api_request('/moderation/photo-cleanup/retry', { method: 'POST', body: {} });
      set_revision((value) => value + 1);
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
    } finally { set_pending(false); }
  };
  return <article className={safety_styles.card}>
    <h2>{t('운영자 신고 관리')}</h2>
    <p>{t('신고 내용은 검토 목적으로만 사용하세요. 조치 전 대상과 처리 사유를 확인해 주세요.')}</p>
    <div className={safety_styles.actions}>
      <button className="quietButton" type="button" disabled={pending} onClick={() => { set_status(status === 'open' ? 'resolved' : 'open'); set_cursor(null); }}>{t(status === 'open' ? '처리 이력 보기' : '미처리 신고 보기')}</button>
      <button className="quietButton" type="button" disabled={reports.loading || pending} onClick={() => set_revision((value) => value + 1)}>{t('새로고침')}</button>
    </div>
    <RequestState loading={reports.loading} error={reports.error || (!selected_report && error_message)} on_retry={() => set_revision((value) => value + 1)} />
    {reports.data && !reports.error && <>
      <p>{t('사진 삭제 대기 {0}건 · 실패 {1}건', [reports.data.photo_cleanup_pending, reports.data.photo_cleanup_failed])}</p>
      {reports.data.photo_cleanup_failed > 0 && <button className={safety_styles.dangerButton} type="button" disabled={pending} onClick={retry_cleanup}>{t('실패한 사진 삭제 다시 시도')}</button>}
      {!reports.data.reports.length && <p>{t('표시할 신고가 없습니다.')}</p>}
      <ul className={safety_styles.list}>{reports.data.reports.map((report) => <li key={report.report_uuid}>
        <strong>{report.content_type} · {report.reason}</strong><small>{report.created_at.slice(0, 10)} · {report.report_uuid}</small>
        {report.content_snapshot && <p className={safety_styles.reportText}>{report.content_snapshot}</p>}
        {report.details && <p>{report.details}</p>}
        {report.resolution_note && <p>{report.resolution}: {report.resolution_note}</p>}
        {report.status === 'open' && <button className="quietButton" type="button" onClick={() => { set_selected_report(report); set_note(''); set_action('remove_content'); set_error_message(''); }}>{t('신고 검토·조치')}</button>}
      </li>)}</ul>
      <div className={safety_styles.actions}>
        {cursor && <button className="quietButton" type="button" onClick={() => set_cursor(null)}>{t('최신 신고로')}</button>}
        {reports.data.next_cursor && <button className="quietButton" type="button" onClick={() => set_cursor(reports.data.next_cursor)}>{t('이전 신고 보기')}</button>}
      </div>
    </>}
    {selected_report && <SafetyDialog title={t('신고 검토·조치')} pending={pending} on_close={() => set_selected_report(null)}>
      <p className={safety_styles.reportText}>{selected_report.content_snapshot || selected_report.details}</p>
      <form className={safety_styles.form} onSubmit={resolve_report}>
        <label>{t('조치')}<select value={action} disabled={pending} onChange={(event) => set_action(event.target.value)}>
          <option value="remove_content">{t('신고 콘텐츠 숨김')}</option><option value="suspend_user">{t('콘텐츠 숨김 및 계정 이용 제한')}</option><option value="dismiss">{t('위반 아님으로 종결')}</option>
        </select></label>
        <label>{t('처리 사유')}<textarea required maxLength={1000} value={note} disabled={pending} onChange={(event) => set_note(event.target.value)} /></label>
        {error_message && <p className="requestState" role="alert">{error_message}</p>}
        <button className={safety_styles.dangerButton} type="submit" disabled={pending || !note.trim()}>{t(pending ? '처리 중…' : '조치 확정')}</button>
      </form>
    </SafetyDialog>}
  </article>;
}

export default function SafetySettings({ on_unauthorized }) {
  const { t, localize_message } = useLanguage();
  const [revision, set_revision] = useState(0);
  const [pending_uuid, set_pending_uuid] = useState(null);
  const [error_message, set_error_message] = useState('');
  const blocks = useApiResource('/safety/blocks', revision, on_unauthorized);
  const status = useApiResource('/safety/status', revision, on_unauthorized);
  const unblock_user = async (user_uuid) => {
    if (pending_uuid) return;
    set_pending_uuid(user_uuid); set_error_message('');
    try {
      await api_request(`/safety/blocks/${user_uuid}`, { method: 'DELETE' });
      set_revision((value) => value + 1);
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
    } finally { set_pending_uuid(null); }
  };
  return <>
    <article className={safety_styles.card}>
      <h2>{t('차단한 사용자')}</h2>
      <RequestState loading={blocks.loading} error={blocks.error || error_message} on_retry={() => set_revision((value) => value + 1)} />
      {blocks.data && !blocks.error && (!blocks.data.users.length ? <p>{t('차단한 사용자가 없습니다.')}</p> : <ul className={safety_styles.list}>{blocks.data.users.map((user) => <li key={user.user_uuid}>
        <strong>{user.display_name || t('사용자')}</strong>
        <button className="quietButton" type="button" disabled={Boolean(pending_uuid)} onClick={() => unblock_user(user.user_uuid)}>{t(pending_uuid === user.user_uuid ? '처리 중…' : '차단 해제')}</button>
      </li>)}</ul>)}
    </article>
    {status.error && <RequestState error={status.error} on_retry={() => set_revision((value) => value + 1)} />}
    {status.data?.is_moderator && <ModerationQueue on_unauthorized={on_unauthorized} />}
  </>;
}
