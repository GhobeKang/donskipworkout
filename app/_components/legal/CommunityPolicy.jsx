'use client';

import { useState } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import useApiResource from '../../_hooks/useApiResource';
import { api_request } from '../../_lib/api';
import RequestState from '../ui/RequestState';
import SafetyDialog from '../safety/SafetyDialog';
import safety_styles from '../safety/Safety.module.css';

const ignore_unauthorized = () => {};

export default function CommunityPolicy({ accepted_version, on_change, disabled = false, show_agreement = false }) {
  const { t, language } = useLanguage();
  const [revision, set_revision] = useState(0);
  const policy = useApiResource('/policies/community', revision, ignore_unauthorized);
  return <div className={safety_styles.document}>
    <RequestState loading={policy.loading} error={policy.error} on_retry={() => set_revision((value) => value + 1)} />
    {policy.data && !policy.error && <>
      <details><summary>{t('이용약관·커뮤니티 정책 읽기')}</summary>
        <small>{t('정책 버전')}: {policy.data.version}</small>
        {policy.data.sections.map((section, index) => <section key={index}>
          <h3>{language === 'en' ? section.title_en : section.title}</h3>
          <p>{language === 'en' ? section.body_en : section.body}</p>
        </section>)}
        <p><a href="mailto:sayudogu@gmail.com">sayudogu@gmail.com</a></p>
      </details>
      {show_agreement && <label className={safety_styles.checkLabel}>
        <input type="checkbox" required disabled={disabled || policy.loading}
          checked={accepted_version === policy.data.version}
          onChange={(event) => on_change(event.target.checked ? policy.data.version : '')} />
        <span>{t('이용약관과 금지 콘텐츠·신고·차단 정책에 동의합니다.')}</span>
      </label>}
    </>}
  </div>;
}

export function CommunityGate({ on_unauthorized, children }) {
  const { t, localize_message } = useLanguage();
  const [revision, set_revision] = useState(0);
  const [accepted_version, set_accepted_version] = useState('');
  const [pending, set_pending] = useState(false);
  const [error_message, set_error_message] = useState('');
  const status = useApiResource('/safety/status', revision, on_unauthorized);
  const accept_policy = async () => {
    if (pending || !accepted_version) return;
    set_pending(true); set_error_message('');
    try {
      await api_request('/me/community-consent', { method: 'PUT', body: { version: accepted_version } });
      set_revision((value) => value + 1);
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
    } finally { set_pending(false); }
  };
  if (status.data && !status.error
    && status.data.accepted_policy_version === status.data.community_policy_version) return children;
  return <article className={safety_styles.card}>
    <h2>{t('커뮤니티 참여 전 확인')}</h2>
    <p>{t('챌린지와 코칭에 참여하려면 이용약관에 동의해 주세요. 개인 기록과 계정 삭제는 동의 없이 이용할 수 있습니다.')}</p>
    <RequestState loading={status.loading} error={status.error || error_message} on_retry={() => set_revision((value) => value + 1)} />
    {status.data && !status.error && <>
      <CommunityPolicy show_agreement accepted_version={accepted_version} on_change={set_accepted_version} disabled={pending} />
      <button className="wideButton primary" type="button" disabled={pending || !accepted_version} onClick={accept_policy}>{t(pending ? '저장 중…' : '동의하고 참여하기')}</button>
    </>}
  </article>;
}

export function LegalDocuments({ compact = false }) {
  const { t } = useLanguage();
  const [documents_open, set_documents_open] = useState(false);
  const legal_content = <>
    <CommunityPolicy />
    <details className={safety_styles.document}><summary>{t('개인정보처리방침')}</summary>
      <iframe className={safety_styles.policyFrame} src="/legal/privacy.html" title={t('개인정보처리방침')} loading="lazy" />
    </details>
    <p><a href="mailto:sayudogu@gmail.com">sayudogu@gmail.com</a></p>
  </>;
  if (compact) return <>
    <button className={safety_styles.legalLink} type="button" aria-haspopup="dialog" onClick={() => set_documents_open(true)}>{t('약관·개인정보·문의')}</button>
    {documents_open && <SafetyDialog title={t('약관·개인정보·문의')} on_close={() => set_documents_open(false)}>
      <div className={safety_styles.document}>{legal_content}</div>
    </SafetyDialog>}
  </>;
  return <article className={safety_styles.card}>
    <h2>{t('약관·개인정보·문의')}</h2>
    {legal_content}
  </article>;
}
