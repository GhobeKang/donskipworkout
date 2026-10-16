'use client';

import { useId, useState } from 'react';
import { api_request } from '../../_lib/api';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';
import SafetyDialog from './SafetyDialog';
import safety_styles from './Safety.module.css';

const report_reasons = [
  ['harassment', '괴롭힘·협박'], ['sexual', '성적·불법 콘텐츠'], ['hate', '혐오·차별'],
  ['privacy', '개인정보 침해'], ['spam', '스팸·사기'], ['dangerous', '위험한 행동 강요'], ['other', '기타'],
];

export default function SafetyActions({ content_type, content_id, target_user_uuid, on_unauthorized, on_blocked }) {
  const { t, localize_message } = useLanguage();
  const field_id = useId();
  const [dialog_mode, set_dialog_mode] = useState(null);
  const [reason, set_reason] = useState('harassment');
  const [details, set_details] = useState('');
  const [pending, set_pending] = useState(false);
  const [error_message, set_error_message] = useState('');
  const [notice, set_notice] = useState('');
  const open_dialog = (mode) => { set_error_message(''); set_notice(''); set_dialog_mode(mode); };
  const submit_action = async (event) => {
    event.preventDefault();
    if (pending) return;
    set_pending(true); set_error_message('');
    try {
      if (dialog_mode === 'block') {
        await api_request(`/safety/blocks/${target_user_uuid}`, { method: 'PUT', body: {} });
        set_notice(t('사용자를 차단했습니다. 설정에서 해제할 수 있습니다.'));
        set_dialog_mode(null);
        on_blocked?.();
      } else {
        await api_request('/safety/reports', { method: 'POST', body: { content_type, content_id: String(content_id), reason, details: details.trim() } });
        set_notice(t('신고가 접수되었습니다. 운영자가 검토합니다.'));
        set_dialog_mode(null); set_details('');
      }
    } catch (error) {
      if (error.status === 401) on_unauthorized?.();
      else set_error_message(localize_message(error.message));
    } finally { set_pending(false); }
  };
  return <>
    <div className={safety_styles.actions}>
      <button type="button" className="quietButton" onClick={() => open_dialog('report')}><MaterialIcon>flag</MaterialIcon>{t('신고')}</button>
      {target_user_uuid && <button type="button" className="quietButton" onClick={() => open_dialog('block')}><MaterialIcon>block</MaterialIcon>{t('사용자 차단')}</button>}
    </div>
    {notice && <p className="infoText" role="status">{notice}</p>}
    {dialog_mode && <SafetyDialog title={t(dialog_mode === 'block' ? '사용자 차단' : '콘텐츠·사용자 신고')} pending={pending} on_close={() => set_dialog_mode(null)}>
      <form className={safety_styles.form} onSubmit={submit_action}>
        {dialog_mode === 'block' ? <p>{t('차단하면 이 사용자와의 대화·직접 알림이 중단되고 콘텐츠가 숨겨집니다. 방장을 차단하면 해당 방도 목록에서 숨겨집니다.')}</p> : <>
          <p>{t('신고 대상 내용과 아래 설명이 운영자에게 전달됩니다. 비밀번호 등 불필요한 개인정보를 적지 마세요.')}</p>
          <label htmlFor={`${field_id}-reason`}>{t('신고 사유')}<select id={`${field_id}-reason`} value={reason} onChange={(event) => set_reason(event.target.value)} disabled={pending}>{report_reasons.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
          <label htmlFor={`${field_id}-details`}>{t('추가 설명 (선택)')}<textarea id={`${field_id}-details`} maxLength={1000} value={details} disabled={pending} onChange={(event) => set_details(event.target.value)} /></label>
        </>}
        {error_message && <p className="requestState" role="alert">{error_message}</p>}
        <button className={dialog_mode === 'block' ? safety_styles.dangerButton : 'wideButton primary'} type="submit" disabled={pending}>{t(pending ? '처리 중…' : dialog_mode === 'block' ? '차단하기' : '신고 보내기')}</button>
      </form>
    </SafetyDialog>}
  </>;
}
