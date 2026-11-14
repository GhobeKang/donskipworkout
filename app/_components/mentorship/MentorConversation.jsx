import { useEffect, useRef, useState } from 'react';
import { api_request } from '../../_lib/api';
import { useLanguage } from '../../_hooks/useLanguage';
import useMentorshipFeed from '../../_hooks/useMentorshipFeed';
import useMentorshipAction from '../../_hooks/useMentorshipAction';
import RequestState from '../ui/RequestState';
import MaterialIcon from '../ui/MaterialIcon';
import SafetyActions from '../safety/SafetyActions';
import styles from './Mentorship.module.css';

export default function MentorConversation({ relationship, on_unauthorized }) {
  const { t, language } = useLanguage();
  const [body, set_body] = useState('');
  const [read_error, set_read_error] = useState('');
  const request_id_ref = useRef(null);
  const end_ref = useRef(null);
  const path = `/mentorship/relationships/${relationship.relationship_uuid}`;
  const feed = useMentorshipFeed(`${path}/messages`, 'messages', on_unauthorized, true);
  const action = useMentorshipAction(on_unauthorized);
  const latest_message_id = feed.items.at(-1)?.message_id;
  const format_date = (value) => new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  useEffect(() => {
    if (!latest_message_id) return undefined;
    const controller = new AbortController();
    end_ref.current?.scrollIntoView({ block: 'nearest' });
    set_read_error('');
    api_request(`${path}/read`, { method: 'POST', body: { message_id: latest_message_id }, signal: controller.signal })
      .then(() => { if (!controller.signal.aborted) window.dispatchEvent(new Event('notification-inbox-changed')); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) on_unauthorized();
        else { console.error('[MENTOR_READ_STATUS_ERROR]', error.status); set_read_error('읽음 상태를 저장하지 못했습니다.'); }
      });
    return () => controller.abort();
  }, [latest_message_id, path, on_unauthorized]);
  return <article className={styles.card}>
    <div className={styles.row}><h2>{t('코칭 메시지')}</h2>
      <button className="quietButton" type="button" disabled={feed.loading || action.pending || !feed.can_retry} onClick={feed.refresh} aria-label={t('대화 새로고침')}><MaterialIcon>refresh</MaterialIcon></button></div>
    <p className={styles.muted}>{t('두 사람만 볼 수 있는 대화입니다. 신고한 내용은 운영자에게 전달됩니다. 새 메시지는 새로고침하면 표시됩니다.')}</p>
    <RequestState loading={feed.loading} error={feed.error} on_retry={feed.can_retry ? feed.refresh : undefined} />
    {feed.next_cursor && <button className="textButton" type="button" disabled={feed.loading || !feed.can_retry} onClick={feed.load_more}>{t('이전 메시지 보기')}</button>}
    {!feed.error && <ol className={styles.messages}>{feed.items.map((message) => <li key={message.message_id} className={message.is_mine ? styles.mine : styles.received}>
      <div className={styles.row}><strong>{message.is_mine ? t('나') : relationship.counterpart_name}</strong><time dateTime={message.created_at}>{format_date(message.created_at)}</time></div>
      <p>{message.body}</p>
      {!message.is_mine && !message.is_removed && <SafetyActions content_type="mentor_message" content_id={message.message_id} on_unauthorized={on_unauthorized} />}
    </li>)}</ol>}
    {!feed.loading && !feed.error && feed.items.length === 0 && <p className={styles.empty}>{t('아직 메시지가 없습니다. 첫 문의를 남겨 보세요.')}</p>}
    <div ref={end_ref} />
    {read_error && <p className={styles.muted} role="status">{t(read_error)}</p>}
    {relationship.can_write ? <form className={styles.form} onSubmit={async (event) => {
      event.preventDefault();
      const trimmed_body = body.trim();
      if (!trimmed_body || action.pending) return;
      if (request_id_ref.current?.body !== trimmed_body) request_id_ref.current = { body: trimmed_body, request_id: crypto.randomUUID() };
      const result = await action.run(`${path}/messages`, 'POST', request_id_ref.current);
      if (result) { set_body(''); request_id_ref.current = null; feed.reload_after_save(); }
    }}>
      <label>{t(relationship.role === 'mentor' ? '회원에게 답변하기' : '코치에게 문의하기')}
        <textarea rows={4} maxLength={2000} value={body} required disabled={action.pending} onChange={(event) => set_body(event.target.value)} /></label>
      <div className={styles.row}><small>{body.length} / 2000</small><button className="wideButton primary" type="submit" disabled={action.pending || !body.trim()}>{t(action.pending ? '전송 중…' : '메시지 보내기')}</button></div>
      <RequestState error={action.error} />
    </form> : <p className={styles.notice}>{t('현재 이 대화는 조회만 가능합니다.')}</p>}
  </article>;
}
