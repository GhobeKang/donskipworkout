'use client';

import { useEffect, useState } from 'react';
import useApiResource from '../../_hooks/useApiResource';
import useMentorshipFeed from '../../_hooks/useMentorshipFeed';
import useMentorshipAction from '../../_hooks/useMentorshipAction';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';
import RequestState from '../ui/RequestState';
import MentorWorkspace from './MentorWorkspace';
import styles from './Mentorship.module.css';
import HelpLink from '../help/HelpLink';

function MentorRegistration({ on_registered, on_unauthorized }) {
  const { t } = useLanguage();
  const [mentor_uuid, set_mentor_uuid] = useState('');
  const [sharing_consent, set_sharing_consent] = useState(false);
  const action = useMentorshipAction(on_unauthorized);
  return <article className={styles.card}>
    <h2>{t('코치 등록')}</h2>
    <p className={styles.muted}>{t('코치의 코칭 화면에 표시된 회원 ID를 입력해 주세요. 챌린지 참여 여부와 관계없이 연결됩니다.')}</p>
    <form className={styles.form} onSubmit={async (event) => {
      event.preventDefault();
      const result = await action.run('/mentorship/relationships', 'POST', { mentor_uuid: mentor_uuid.trim(), sharing_consent });
      if (result) on_registered(result.relationship_uuid);
    }}>
      <label>{t('코치의 회원 ID')}<input name="mentor_uuid" type="text" value={mentor_uuid} required maxLength={36}
        pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" spellCheck={false} autoCapitalize="none"
        disabled={action.pending} onChange={(event) => set_mentor_uuid(event.target.value)} /></label>
      <label className={styles.consent}><input type="checkbox" checked={sharing_consent} required disabled={action.pending} onChange={(event) => set_sharing_consent(event.target.checked)} />
        <span>{t('이 코치에게 내 연구일지 전체와 운동 수행 리포트를 공유하고, 연구일지 수정 권한을 부여합니다.')}</span></label>
      <p className={styles.muted}>{t('회원 한 명당 코치 한 명을 등록할 수 있습니다. 양쪽 모두 언제든 관계를 해제할 수 있습니다.')}</p>
      <RequestState error={action.error} />
      <button className="wideButton primary" type="submit" disabled={action.pending || !sharing_consent || !mentor_uuid.trim()}>{t(action.pending ? '등록 중…' : '코치로 등록하기')}</button>
    </form>
  </article>;
}

function RelationshipList({ role, status, on_select, on_unauthorized }) {
  const { t } = useLanguage();
  const feed = useMentorshipFeed(`/mentorship/relationships?role=${role}&status=${status}`, 'relationships', on_unauthorized);
  return <div className={styles.card}>
    <div className={styles.row}><h2>{t(status === 'ended' ? '지난 코칭 대화' : '코칭 회원')}</h2>
      <button className="quietButton" type="button" disabled={feed.loading || !feed.can_retry} onClick={feed.refresh} aria-label={t('목록 새로고침')}><MaterialIcon>refresh</MaterialIcon></button></div>
    <RequestState loading={feed.loading} error={feed.error} on_retry={feed.can_retry ? feed.refresh : undefined} />
    {!feed.error && <ul className={styles.people}>{feed.items.map((relationship) => <li key={relationship.relationship_uuid}>
      <button type="button" onClick={() => on_select(relationship.relationship_uuid)}>
        <span className={styles.avatar}><MaterialIcon>{role === 'mentor' ? 'person' : 'school'}</MaterialIcon></span>
        <span className={styles.personText}><strong>{relationship.counterpart_name}</strong><small>{relationship.latest_message || t(status === 'ended' ? '관계 해제 · 대화 조회만 가능' : '아직 메시지가 없습니다.')}</small></span>
        {relationship.unread_count > 0 && <span className={styles.badge} aria-label={t('읽지 않은 메시지 {0}개', [relationship.unread_count])}>{relationship.unread_count}</span>}
        <MaterialIcon>chevron_right</MaterialIcon>
      </button>
    </li>)}</ul>}
    {!feed.loading && !feed.error && feed.items.length === 0 && <p className={styles.empty}>{t(status === 'ended' ? '지난 코칭 대화가 없습니다.' : '아직 연결된 회원이 없습니다. 내 회원 ID를 회원에게 전달해 주세요.')}</p>}
    {feed.next_cursor && <button className="textButton" type="button" disabled={feed.loading || !feed.can_retry} onClick={feed.load_more}>{t('더 보기')}</button>}
  </div>;
}

export default function MentorshipScreen({ on_unauthorized, on_research_change, initial_relationship_uuid = '', initial_tab = 'messages', initial_role = 'apprentice' }) {
  const { t } = useLanguage();
  const [revision, set_revision] = useState(0);
  const [active_role, set_active_role] = useState(initial_role);
  const [show_history, set_show_history] = useState(false);
  const [selected_relationship_uuid, set_selected_relationship_uuid] = useState(initial_relationship_uuid);
  const [copy_notice, set_copy_notice] = useState('');
  const [retry_count, set_retry_count] = useState(0);
  const dashboard = useApiResource('/mentorship', revision, on_unauthorized);
  useEffect(() => {
    const refresh_notifications = () => set_revision((value) => value + 1);
    window.addEventListener('coaching-notifications-updated', refresh_notifications);
    return () => window.removeEventListener('coaching-notifications-updated', refresh_notifications);
  }, []);
  const refresh = () => { set_retry_count(0); set_revision((value) => value + 1); };
  if (selected_relationship_uuid) return <MentorWorkspace key={selected_relationship_uuid}
    initial_tab={initial_tab}
    relationship_uuid={selected_relationship_uuid} on_unauthorized={on_unauthorized} on_research_change={on_research_change}
    on_back={() => { set_selected_relationship_uuid(''); refresh(); }} />;
  return <section className="viewPanel isVisible">
    <header className="pageHeader"><div><p className="eyebrow">{t('함께 이어가는 운동')}</p><h1>{t('운동에 진심이라면...')}</h1></div><MaterialIcon>school</MaterialIcon></header>
    <HelpLink question_id="coaching">{t('코치 등록과 공유 범위 알아보기')}</HelpLink>
    <div className={styles.stack}>
      <article className={`${styles.card} ${styles.intro}`}>
        <h2>{t('챌린지 밖에서도, 코칭은 계속')}</h2>
        <p>{t('연구일지와 운동 리포트를 함께 보고, 회원과 깊은 유대관계를 만들어 보세요.')}</p>
        {dashboard.data && <><label className={styles.memberId}>{t('내 회원 ID')}<input aria-label={t('내 회원 ID')} value={dashboard.data.member_uuid} readOnly onFocus={(event) => event.target.select()} /></label>
          <button type="button" className="quietButton" onClick={async () => {
            try { await navigator.clipboard.writeText(dashboard.data.member_uuid); set_copy_notice(t('회원 ID를 복사했습니다.')); }
            catch { set_copy_notice(t('회원 ID를 선택해 직접 복사해 주세요.')); }
          }}><MaterialIcon>content_copy</MaterialIcon>{t('회원 ID 복사')}</button>
          {dashboard.data.unread_count > 0 && <p>{t('읽지 않은 메시지 {0}개', [dashboard.data.unread_count])}</p>}
        </>}
        {copy_notice && <p role="status">{copy_notice}</p>}
      </article>
      <RequestState loading={dashboard.loading} error={dashboard.error} on_retry={retry_count < 2 ? () => { set_retry_count((value) => value + 1); set_revision((value) => value + 1); } : undefined} />
      {dashboard.data && !dashboard.error && <>
        <div className={styles.tabs} aria-label={t('코칭 역할')}>
          {[['apprentice', '내 코치'], ['mentor', '코칭 회원']].map(([role, label]) => <button key={role} type="button" aria-pressed={active_role === role} onClick={() => { set_active_role(role); set_show_history(false); }}>{t(label)}{role === 'mentor' ? ` (${dashboard.data.apprentice_count})` : ''}</button>)}
        </div>
        <label className={styles.historyToggle}><input type="checkbox" checked={show_history} onChange={(event) => set_show_history(event.target.checked)} />{t('해제된 관계의 대화 보기')}</label>
        {active_role === 'apprentice' && !show_history ? (dashboard.data.mentor ? <article className={styles.card}>
          <p className="eyebrow">{t('내 코치')}</p><h2>{dashboard.data.mentor.counterpart_name}</h2>
          <p className={styles.muted}>{t('내 연구일지와 수행 리포트를 공유하고 있습니다.')}</p>
          <button type="button" className="wideButton primary" onClick={() => set_selected_relationship_uuid(dashboard.data.mentor.relationship_uuid)}>
            <MaterialIcon>chat_bubble</MaterialIcon>{t('코치에게 문의하기')}{dashboard.data.mentor.unread_count > 0 ? ` (${dashboard.data.mentor.unread_count})` : ''}
          </button>
        </article> : <MentorRegistration on_unauthorized={on_unauthorized} on_registered={(relationship_uuid) => { refresh(); set_selected_relationship_uuid(relationship_uuid); }} />)
          : <RelationshipList key={`${active_role}:${show_history}:${revision}`} role={active_role} status={show_history ? 'ended' : 'active'} on_select={set_selected_relationship_uuid} on_unauthorized={on_unauthorized} />}
      </>}
    </div>
  </section>;
}
