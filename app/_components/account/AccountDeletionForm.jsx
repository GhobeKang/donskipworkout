'use client';

import { useEffect, useId, useState } from 'react';
import { api_request } from '../../_lib/api';
import { clear_deleted_account_data } from '../../_lib/accountDeletion';
import { useLanguage } from '../../_hooks/useLanguage';
import SafetyDialog from '../safety/SafetyDialog';
import safety_styles from '../safety/Safety.module.css';

export default function AccountDeletionForm({ user_uuid, on_deleted, is_public = false }) {
  const { t, language, localize_message } = useLanguage();
  const field_id = useId();
  const [dialog_open, set_dialog_open] = useState(false);
  const [email, set_email] = useState('');
  const [password, set_password] = useState('');
  const [confirmation, set_confirmation] = useState('');
  const [pending, set_pending] = useState(false);
  const [deleted, set_deleted] = useState(false);
  const [error_message, set_error_message] = useState('');
  useEffect(() => { if (is_public) document.documentElement.lang = language; }, [is_public, language]);
  const delete_account = async (event) => {
    event.preventDefault();
    if (pending || confirmation !== 'DELETE' || !password) return;
    set_pending(true); set_error_message('');
    try {
      const result = await api_request(is_public ? '/auth/delete-account' : '/me/account', {
        method: is_public ? 'POST' : 'DELETE',
        body: { password, confirmation, ...(is_public ? { email: email.trim() } : {}) },
      });
      if (!result.deleted) throw new Error(t('계정 삭제 결과를 확인하지 못했습니다.'));
      set_password(''); set_email(''); set_confirmation(''); set_deleted(true); set_dialog_open(false);
      on_deleted?.(t('계정과 서버 기록을 삭제했습니다.'));
      clear_deleted_account_data(user_uuid || result.deleted_user_uuid, { is_current_account: !is_public });
    } catch (error) {
      set_error_message(error.status === 401
        ? t('로그인이 만료되었습니다. 다시 로그인하거나 외부 계정 삭제 페이지를 이용해 주세요.')
        : localize_message(error.message));
    } finally { set_pending(false); }
  };
  const deletion_fields = <>
    <p>{t('계정, 운동 기록, 인증 사진, 코칭 대화와 알림 데이터를 삭제합니다. 삭제 후에는 복구할 수 없습니다. 방장이면 챌린지는 방장 공석으로 처리되며 다른 참가자의 개인 기록은 유지됩니다.')}</p>
    <p className={safety_styles.notice}>{t('계정과 연결된 서버 데이터는 요청 처리 시 삭제하며, 사진 파일은 별도 정리 작업으로 삭제합니다. 백업과 이미 외부에 공유한 사본은 별도 보관 정책의 영향을 받을 수 있습니다.')}</p>
    <form className={safety_styles.form} onSubmit={delete_account}>
      <fieldset disabled={pending}>
        {is_public && <label htmlFor={`${field_id}-email`}>{t('계정 이메일')}<input id={`${field_id}-email`} type="email" autoComplete="username" required maxLength={255} value={email} onChange={(event) => set_email(event.target.value)} /></label>}
        <label htmlFor={`${field_id}-password`}>{t('현재 비밀번호')}<input id={`${field_id}-password`} type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={(event) => set_password(event.target.value)} /></label>
        <label htmlFor={`${field_id}-confirmation`}>{t('삭제를 확인하려면 DELETE를 입력하세요.')}<input id={`${field_id}-confirmation`} autoComplete="off" spellCheck={false} required value={confirmation} onChange={(event) => set_confirmation(event.target.value)} /></label>
        {error_message && <p className="requestState" role="alert">{error_message}</p>}
        <button className={safety_styles.dangerButton} type="submit" disabled={pending || confirmation !== 'DELETE' || !password}>{t(pending ? '삭제 중…' : '계정과 데이터 영구 삭제')}</button>
      </fieldset>
    </form>
    <p><a href="mailto:sayudogu@gmail.com">sayudogu@gmail.com</a></p>
  </>;
  return <article className={safety_styles.card}>
    {is_public ? <h1>{t("DON'T SKIP 계정 삭제")}</h1> : <h2>{t("DON'T SKIP 계정 삭제")}</h2>}
    {deleted ? <p role="status">{t('계정과 서버 기록을 삭제했습니다. 사진 파일 정리가 진행됩니다. 앱을 삭제해도 새 계정은 생성되지 않습니다.')}</p> : is_public ? deletion_fields : <>
      <p>{t('현재 비밀번호를 확인한 뒤 계정과 연결된 데이터를 삭제할 수 있습니다.')}</p>
      <button className={safety_styles.dangerButton} type="button" onClick={() => { set_error_message(''); set_dialog_open(true); }}>{t('계정 삭제')}</button>
      {dialog_open && <SafetyDialog title={t('계정 삭제')} pending={pending} on_close={() => { set_dialog_open(false); set_password(''); set_confirmation(''); }}>{deletion_fields}</SafetyDialog>}
    </>}
  </article>;
}
