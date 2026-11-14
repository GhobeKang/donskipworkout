import { useState } from 'react';
import useMentorshipFeed from '../../_hooks/useMentorshipFeed';
import useMentorshipAction from '../../_hooks/useMentorshipAction';
import { useLanguage } from '../../_hooks/useLanguage';
import { exercise_label } from '../../_lib/i18n';
import RequestState from '../ui/RequestState';
import MaterialIcon from '../ui/MaterialIcon';
import ResearchRevisionHistory from '../workout/ResearchRevisionHistory';
import ResearchNoteContent from '../workout/ResearchNoteContent';
import styles from './Mentorship.module.css';

export default function MentorResearchRecords({ relationship_uuid, on_unauthorized, on_change }) {
  const { t, language } = useLanguage();
  const path = `/mentorship/relationships/${relationship_uuid}/research-records`;
  const feed = useMentorshipFeed(path, 'records', on_unauthorized);
  const action = useMentorshipAction(on_unauthorized);
  const [editing_record, set_editing_record] = useState(null);
  const [content, set_content] = useState('');
  const [notice, set_notice] = useState('');
  return <article className={styles.card}>
    <div className={styles.row}><h2>{t('회원의 연구일지')}</h2><button className="quietButton" type="button" disabled={feed.loading || action.pending || !feed.can_retry} onClick={feed.refresh} aria-label={t('연구일지 새로고침')}><MaterialIcon>refresh</MaterialIcon></button></div>
    <p className={styles.muted}>{t('수정한 내용과 이전 내용은 회원에게도 표시됩니다. 운동 수행 기록 자체는 변경하지 않습니다.')}</p>
    <RequestState loading={feed.loading} error={feed.error} on_retry={feed.can_retry ? feed.refresh : undefined} />
    {notice && <p role="status">{notice}</p>}
    <RequestState error={action.error} />
    {!feed.error && <ol className={styles.researchList}>{feed.items.map((record) => <li key={record.record_id}>
      <h3>{exercise_label(record, language)}</h3><time dateTime={record.created_at}>{new Date(record.created_at).toLocaleString(language === 'en' ? 'en-US' : 'ko-KR')}</time>
      {editing_record?.record_id === record.record_id ? <form className={styles.form} onSubmit={async (event) => {
        event.preventDefault();
        const result = await action.run(`${path}/${record.record_id}`, 'PUT', { content: content.trim(), expected_revision: editing_record.revision });
        if (result) { set_editing_record(null); set_notice(t('연구일지를 수정했습니다. 수정 이력이 저장되었습니다.')); on_change(); feed.reload_after_save(); }
      }}>
        <label>{t('연구 기록 수정')}<textarea rows={5} maxLength={2000} value={content} required disabled={action.pending} onChange={(event) => set_content(event.target.value)} /></label>
        <div className={styles.row}><button type="button" className="textButton" disabled={action.pending} onClick={() => set_editing_record(null)}>{t('취소')}</button><button className="wideButton primary" type="submit" disabled={action.pending || !content.trim()}>{t(action.pending ? '저장 중…' : '저장')}</button></div>
      </form> : <>
        <ResearchNoteContent record={record} />
        {record.updated_at && <p className={styles.muted}>{t('최근 수정: {0}', [record.updated_by_name || t('탈퇴한 사용자')])} · v{record.revision}</p>}
        <button type="button" className="textButton" disabled={action.pending} onClick={() => { set_editing_record(record); set_content(record.content); set_notice(''); }}>{t('연구 기록 수정')}</button>
      </>}
      <ResearchRevisionHistory path={`${path}/${record.record_id}/revisions`} revision={record.revision} on_unauthorized={on_unauthorized} />
    </li>)}</ol>}
    {!feed.loading && !feed.error && feed.items.length === 0 && <p className={styles.empty}>{t('회원이 작성한 연구일지가 없습니다.')}</p>}
    {feed.next_cursor && <button type="button" className="textButton" disabled={feed.loading || !feed.can_retry} onClick={feed.load_more}>{t('더 보기')}</button>}
  </article>;
}
