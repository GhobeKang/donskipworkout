import { useState } from 'react';
import useApiResource from '../../_hooks/useApiResource';
import useMentorshipAction from '../../_hooks/useMentorshipAction';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';
import RequestState from '../ui/RequestState';
import SafetyActions from '../safety/SafetyActions';
import MentorConversation from './MentorConversation';
import MentorResearchRecords from './MentorResearchRecords';
import MentorReport from './MentorReport';
import styles from './Mentorship.module.css';

export default function MentorWorkspace({ relationship_uuid, on_unauthorized, on_back, on_research_change, initial_tab = 'messages' }) {
  const { t } = useLanguage();
  const [active_tab, set_active_tab] = useState(initial_tab === 'research' ? 'research' : 'messages');
  const [revision, set_revision] = useState(0);
  const [retry_count, set_retry_count] = useState(0);
  const resource = useApiResource(`/mentorship/relationships/${relationship_uuid}`, revision, on_unauthorized);
  const action = useMentorshipAction(on_unauthorized);
  const relationship = resource.data;
  return <section className="viewPanel isVisible">
    <header className="pageHeader"><button className="backButton" type="button" onClick={on_back} disabled={action.pending} aria-label={t('코칭 목록으로')}><MaterialIcon>arrow_back</MaterialIcon></button>
      <div><p className="eyebrow">{t(relationship?.role === 'mentor' ? '코칭 회원' : '내 코치')}</p><h1>{relationship?.counterpart_name || t('코칭')}</h1></div></header>
    <RequestState loading={resource.loading} error={resource.error} on_retry={retry_count < 2 ? () => { set_retry_count((value) => value + 1); set_revision((value) => value + 1); } : undefined} />
    {relationship && !resource.error && <div className={styles.stack}>
      {relationship.ended_at && <p className={styles.notice}>{t('관계가 해제되었습니다. 기존 대화만 조회할 수 있습니다.')}</p>}
      {relationship.role === 'mentor' && !relationship.ended_at && <div className={styles.tabs} aria-label={t('회원 코칭 메뉴')}>
        {[['messages', '메시지'], ['research', '연구일지'], ['report', '수행 리포트']].map(([tab, label]) => <button key={tab} type="button" aria-pressed={active_tab === tab} onClick={() => set_active_tab(tab)}>{t(label)}</button>)}
      </div>}
      {(active_tab === 'messages' || relationship.ended_at) && <MentorConversation relationship={relationship} on_unauthorized={on_unauthorized} />}
      {active_tab === 'research' && !relationship.ended_at && <MentorResearchRecords relationship_uuid={relationship_uuid} on_unauthorized={on_unauthorized} on_change={on_research_change} />}
      {active_tab === 'report' && !relationship.ended_at && <MentorReport relationship_uuid={relationship_uuid} timezone={relationship.counterpart_timezone} on_unauthorized={on_unauthorized} />}
      <article className={styles.card}>
        <SafetyActions content_type="user" content_id={relationship.counterpart_uuid} on_unauthorized={on_unauthorized} />
        {!relationship.ended_at && <>
          <p className={styles.muted}>{t('관계를 해제하면 연구일지·리포트 공유와 새 메시지 전송이 중단됩니다. 기존 대화와 수정 이력은 남습니다.')}</p>
          <button className={`quietButton ${styles.danger}`} type="button" disabled={action.pending} onClick={async () => {
            if (!window.confirm(t('코치·회원 관계를 해제할까요? 기록 공유와 새 메시지 전송이 중단됩니다.'))) return;
            const result = await action.run(`/mentorship/relationships/${relationship_uuid}`, 'DELETE');
            if (result) { set_active_tab('messages'); set_revision((value) => value + 1); on_research_change(); }
          }}>{t(action.pending ? '처리 중…' : '관계 해제')}</button>
        </>}
        <RequestState error={action.error} />
      </article>
    </div>}
  </section>;
}
