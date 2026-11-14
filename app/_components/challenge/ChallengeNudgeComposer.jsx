'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { api_request } from '../../_lib/api';
import { useLanguage } from '../../_hooks/useLanguage';
import { get_progress_status_label } from './ChallengeProgressMember';

export default function ChallengeNudgeComposer({ round_uuid, eligible_members, disabled, on_unauthorized }) {
  const { t, localize_message } = useLanguage();
  const message_field_id = useId();
  const [nudge_targets, set_nudge_targets] = useState([]);
  const [nudge_message, set_nudge_message] = useState('');
  const [pending, set_pending] = useState(false);
  const [error_message, set_error_message] = useState('');
  const [nudge_feedback, set_nudge_feedback] = useState('');
  const request_controller = useRef(null);
  const selected_targets = nudge_targets.filter((target_uuid) => eligible_members.some((member) => member.user_uuid === target_uuid));
  const trimmed_message = nudge_message.trim();

  useEffect(() => () => request_controller.current?.abort(), []);

  const send_nudges = async (event) => {
    event.preventDefault();
    if (disabled || request_controller.current || !selected_targets.length || !trimmed_message || nudge_message.length > 200) return;
    const controller = new AbortController();
    request_controller.current = controller;
    set_pending(true);
    set_error_message('');
    set_nudge_feedback('');
    try {
      const result = await api_request(`/challenge-rounds/${round_uuid}/nudges`, {
        method: 'POST',
        body: { request_id: window.crypto.randomUUID(), member_uuids: selected_targets, message: trimmed_message },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      set_nudge_feedback(t('재촉 접수 {0}명 · 제외 {1}명', [result.accepted_count, result.skipped_user_uuids.length]));
      if (result.accepted_count > 0) {
        set_nudge_targets([]);
        set_nudge_message('');
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
    } finally {
      if (!controller.signal.aborted) set_pending(false);
      request_controller.current = null;
    }
  };

  return <article className="challengeCard">
    <div className="sectionHeading"><h2>{t('미완료 참가자 재촉')}</h2></div>
    <p className="infoText">{t('현재 구간에서 목표 미달인 참가자에게 알림을 보냅니다. 1일 최대 2회, 4시간 간격 제한을 적용합니다.')}</p>
    <form className="challengeForm" onSubmit={send_nudges}>
      {eligible_members.length ? <ul className="challengeMemberList">{eligible_members.map((member) => <li key={member.user_uuid}>
        <label className="challengeNotificationOption">
          <input type="checkbox" disabled={disabled || pending} checked={selected_targets.includes(member.user_uuid)} onChange={(event) => set_nudge_targets((current) => event.target.checked ? [...current, member.user_uuid] : current.filter((target_uuid) => target_uuid !== member.user_uuid))} />
          <span><strong>{member.display_name}</strong><small>{member.completed_count}/{member.target_count}{t('일')} · {get_progress_status_label(t, member.status)}</small></span>
        </label>
      </li>)}</ul> : <p className="emptyState">{t('현재 재촉할 수 있는 참가자가 없습니다.')}</p>}
      <label htmlFor={message_field_id}>{t('재촉 메시지')}
        <textarea id={message_field_id} rows={3} maxLength={200} required disabled={disabled || pending || !eligible_members.length}
          value={nudge_message} placeholder={t('예: 오늘 운동 아직 안 했다면, 10분이라도 같이 해요!')}
          aria-describedby={`${message_field_id}-hint ${message_field_id}-count`} onChange={(event) => set_nudge_message(event.target.value)} />
      </label>
      <p id={`${message_field_id}-hint`} className="infoText">{t('작성한 메시지가 선택한 참가자의 푸시 알림과 알림함에 그대로 전달됩니다.')}</p>
      <small id={`${message_field_id}-count`} className="infoText">{nudge_message.length}/200</small>
      {error_message && <p className="infoText" role="alert">{error_message}</p>}
      {nudge_feedback && <p className="challengeSuccess" role="status">{nudge_feedback}</p>}
      <button className="wideButton secondary" type="submit" disabled={disabled || pending || !selected_targets.length || !trimmed_message || nudge_message.length > 200}>{t(pending ? '보내는 중…' : '선택한 참가자 재촉')}</button>
    </form>
  </article>;
}
