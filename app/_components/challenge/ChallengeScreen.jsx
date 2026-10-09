'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api_request } from '../../_lib/api';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';
import ActionModal from '../ui/ActionModal';
import ChallengeNotificationSettings from './ChallengeNotificationSettings';
import ChallengeInbox from './ChallengeInbox';
import ChallengeQuestions from './ChallengeQuestions';
import ChallengeMemberReports from './ChallengeMemberReports';
import ChallengeProgressMember, { get_progress_status_label } from './ChallengeProgressMember';

function get_default_start_date() {
  const seoul_now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  seoul_now.setUTCDate(seoul_now.getUTCDate() + 1);
  return seoul_now.toISOString().slice(0, 10);
}

function get_round_end_date(start_date, duration_days) {
  if (!start_date || !duration_days) return '';
  const end_date = new Date(`${start_date}T00:00:00Z`);
  end_date.setUTCDate(end_date.getUTCDate() + duration_days - 1);
  return end_date.toISOString().slice(0, 10);
}

function format_invite_code(value) {
  const invite_code_chars = value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 8);
  return invite_code_chars.length > 4
    ? `${invite_code_chars.slice(0, 4)}-${invite_code_chars.slice(4)}`
    : invite_code_chars;
}

function ChallengeStatus({ status }) {
  const { t } = useLanguage();
  const status_labels = {
    draft: t('룰북 작성 중'),
    awaiting_consent: t('참가 동의 대기'),
    scheduled: t('개시 예약됨'),
    active: t('진행 중'),
    settling: t('결과 확인 중'),
    review_required: t('운영 확인 필요'),
    completed: t('회차 종료'),
    cancelled: t('취소됨'),
  };
  return <span className="challengeStatus">{status_labels[status] || status}</span>;
}

function can_delete_room(room, user_is_host) {
  return Boolean(user_is_host && room?.can_delete
    && ['draft', 'awaiting_consent', 'scheduled'].includes(room.status));
}

function RoomDeleteButton({ room, user_is_host, pending, on_delete }) {
  const { t } = useLanguage();
  if (!can_delete_room(room, user_is_host)) return null;
  return <button className="quietButton challengeRoomDelete" type="button" disabled={pending}
    onClick={() => on_delete(room)} aria-label={t('{0} 방 삭제', [room.room_name || room.name])}>
    <MaterialIcon>delete</MaterialIcon>{t('방 삭제')}
  </button>;
}

export default function ChallengeScreen({ user_uuid, is_active, on_unauthorized, on_back }) {
  const { t, localize_message } = useLanguage();
  const [rooms, set_rooms] = useState([]);
  const [selected_room, set_selected_room] = useState(null);
  const [delete_confirmation_room, set_delete_confirmation_room] = useState(null);
  const [progress_data, set_progress_data] = useState(null);
  const [progress_loading, set_progress_loading] = useState(false);
  const [list_loading, set_list_loading] = useState(false);
  const [pending, set_pending] = useState(false);
  const [error_message, set_error_message] = useState('');
  const [success_message, set_success_message] = useState('');
  const [room_name, set_room_name] = useState('');
  const [room_description, set_room_description] = useState('');
  const [room_member_limit, set_room_member_limit] = useState(10);
  const [invite_code, set_invite_code] = useState('');
  const [show_invite_form, set_show_invite_form] = useState(false);
  const [active_tab, set_active_tab] = useState('rooms');
  const [notification_settings_round_uuid, set_notification_settings_round_uuid] = useState('');
  const [issued_invite, set_issued_invite] = useState(null);
  const [draft_rulebook, set_draft_rulebook] = useState(null);
  const [rulebook_dirty, set_rulebook_dirty] = useState(false);
  const [nudge_targets, set_nudge_targets] = useState([]);
  const [nudge_feedback, set_nudge_feedback] = useState('');
  const [start_date, set_start_date] = useState(get_default_start_date);
  const invite_link_handled = useRef(false);
  const invite_code_input = useRef(null);

  const load_rooms = useCallback(async (signal) => {
    set_list_loading(true);
    set_error_message('');
    try {
      const result = await api_request('/challenge-rooms', { signal });
      if (!signal?.aborted) set_rooms(result.rooms);
    } catch (error) {
      if (signal?.aborted) return;
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
    } finally {
      if (!signal?.aborted) set_list_loading(false);
    }
  }, [localize_message, on_unauthorized]);

  useEffect(() => {
    if (!is_active) return undefined;
    const controller = new AbortController();
    load_rooms(controller.signal);
    return () => controller.abort();
  }, [is_active, load_rooms]);

  const load_room = async (room_uuid) => {
    set_pending(true);
    set_error_message('');
    set_success_message('');
    set_progress_data(null);
    set_issued_invite(null);
    try {
      const result = await api_request(`/challenge-rooms/${room_uuid}`);
      set_selected_room(result);
      set_draft_rulebook({ ...result.draft_rulebook, start_date: result.draft_rulebook?.start_date || get_default_start_date() });
      set_start_date(result.rulebook?.start_date || result.draft_rulebook?.start_date || get_default_start_date());
      set_rulebook_dirty(!result.draft_rulebook?.start_date);
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
    } finally {
      set_pending(false);
    }
  };

  const mutate = async (path, method, body, success_message, { select_result = false } = {}) => {
    if (pending) return null;
    set_pending(true);
    set_error_message('');
    set_success_message('');
    try {
      const result = await api_request(path, { method, body });
      if (select_result && result) {
        set_selected_room(result);
        set_draft_rulebook({ ...result.draft_rulebook, start_date: result.draft_rulebook?.start_date || get_default_start_date() });
        set_start_date(result.rulebook?.start_date || result.draft_rulebook?.start_date || get_default_start_date());
        set_rulebook_dirty(!result.draft_rulebook?.start_date);
      }
      if (path.endsWith('/publish') && result?.notification_delivery) {
        const { inbox_count, push_queued_count } = result.notification_delivery;
        set_success_message(t('룰북 게시 완료 · 알림함 기록 {0}명 · 푸시 요청 대기 {1}건', [inbox_count, push_queued_count]));
      } else if (success_message) set_success_message(success_message);
      await load_rooms();
      return result;
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
      return null;
    } finally {
      set_pending(false);
    }
  };

  const create_room = async (event) => {
    event.preventDefault();
    const result = await mutate('/challenge-rooms', 'POST', {
      name: room_name,
      description: room_description || null,
      member_limit: room_member_limit,
    }, t('방을 만들었습니다.'), { select_result: true });
    if (result) {
      set_room_name('');
      set_room_description('');
      set_room_member_limit(10);
    }
  };

  const join_room = async (event) => {
    event.preventDefault();
    const result = await mutate('/challenge-invites/join', 'POST', { code: invite_code }, null, { select_result: true });
    if (result) {
      set_invite_code('');
      set_show_invite_form(false);
    }
  };

  useEffect(() => {
    if (!is_active || invite_link_handled.current) return;
    const search_params = new URLSearchParams(window.location.search);
    const notification_room_uuid = search_params.get('room');
    if (notification_room_uuid) {
      invite_link_handled.current = true;
      load_room(notification_room_uuid).then(() => window.history.replaceState({}, '', window.location.pathname));
      return;
    }
    const invite_token = search_params.get('invite');
    if (!invite_token) return;
    invite_link_handled.current = true;
    mutate('/challenge-invites/join', 'POST', { token: invite_token }, null, { select_result: true })
      .then((result) => {
        if (result) window.history.replaceState({}, '', window.location.pathname);
        else invite_link_handled.current = false;
      });
  }, [is_active]);

  useEffect(() => {
    if (!is_active || !selected_room || !['scheduled', 'active', 'settling', 'completed'].includes(selected_room.status)) {
      set_progress_data(null);
      return undefined;
    }
    const controller = new AbortController();
    const load_progress = async () => {
      set_progress_loading(true);
      try {
        const result = await api_request(`/challenge-rounds/${selected_room.round_uuid}/progress`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        set_progress_data(result);
        set_selected_room((current) => current?.round_uuid === result.round_uuid
          ? { ...current, status: result.status }
          : current);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error.status === 401) on_unauthorized();
        else set_error_message(localize_message(error.message));
      } finally {
        if (!controller.signal.aborted) set_progress_loading(false);
      }
    };
    load_progress();
    const refresh_timer = setInterval(load_progress, 30000);
    return () => {
      controller.abort();
      clearInterval(refresh_timer);
    };
  }, [is_active, localize_message, on_unauthorized, selected_room?.round_uuid, selected_room?.status]);

  const save_rulebook = async () => {
    if (!selected_room || !draft_rulebook) return;
    const result = await mutate(
      `/challenge-rounds/${selected_room.round_uuid}/rulebook`,
      'PUT',
      { ...draft_rulebook, start_date, expected_version: selected_room.rulebook_version },
      null,
      { select_result: true },
    );
    if (result) set_rulebook_dirty(false);
  };

  const request_room_delete = (room_to_delete) => {
    const user_is_host = room_to_delete?.host_user_uuid === user_uuid || room_to_delete?.is_host === true;
    if (pending || !can_delete_room(room_to_delete, user_is_host)) return;
    set_error_message('');
    set_success_message('');
    set_delete_confirmation_room(room_to_delete);
  };

  const delete_room = async (room_to_delete) => {
    const user_is_host = room_to_delete?.host_user_uuid === user_uuid || room_to_delete?.is_host === true;
    if (pending || !can_delete_room(room_to_delete, user_is_host)) return;
    set_pending(true);
    set_error_message('');
    set_success_message('');
    try {
      await api_request(`/challenge-rooms/${room_to_delete.room_uuid}`, { method: 'DELETE' });
      set_delete_confirmation_room(null);
      set_rooms((current_rooms) => current_rooms.filter((room) => room.room_uuid !== room_to_delete.room_uuid));
      set_selected_room(null);
      set_progress_data(null);
      set_issued_invite(null);
      set_draft_rulebook(null);
      set_rulebook_dirty(false);
      set_nudge_targets([]);
      set_active_tab('rooms');
      set_success_message(t('방을 삭제했습니다.'));
      await load_rooms();
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
    } finally {
      set_delete_confirmation_room(null);
      set_pending(false);
    }
  };

  const delete_modal_content = useMemo(() => delete_confirmation_room ? {
    icon: 'delete', eyebrow: '방 관리', title: '방 삭제',
    message: t('"{0}" 방을 삭제하면 참가자 모두의 목록에서 사라지고 초대와 예정된 알림이 취소됩니다. 삭제할까요?', [delete_confirmation_room.room_name || delete_confirmation_room.name]),
    detail: t('삭제할 방 이름을 확인해 주세요.'), confirm_label: '방 삭제', pending_label: '삭제 중…',
  } : null, [delete_confirmation_room, t]);
  const delete_confirmation_modal = <ActionModal action={delete_confirmation_room ? 'delete_room' : null}
    content={delete_modal_content} confirm_variant="danger" initial_focus="cancel" pending={pending}
    on_confirm={() => delete_room(delete_confirmation_room)} on_close={() => { if (!pending) set_delete_confirmation_room(null); }} />;

  const published_version = selected_room?.rulebook_version || 0;
  const published_matches_draft = Boolean(selected_room?.rulebook)
    && ['target_count', 'duration_days', 'verification_mode', 'start_date', 'description']
      .every((field) => (selected_room.rulebook[field] ?? null) === (draft_rulebook?.[field] ?? null));
  const user_membership = useMemo(
    () => selected_room?.members.find((member) => member.user_uuid === user_uuid),
    [selected_room, user_uuid],
  );
  const is_host = selected_room?.host_user_uuid === user_uuid;
  const notification_round_uuid = rooms.some((room) => room.round_uuid === notification_settings_round_uuid)
    ? notification_settings_round_uuid
    : rooms[0]?.round_uuid;
  const all_consented = Boolean(selected_room?.members.length)
    && selected_room.members.every((member) => member.consented);
  const can_schedule_status = ['draft', 'awaiting_consent'].includes(selected_room?.status);
  const can_edit = is_host && ['draft', 'awaiting_consent'].includes(selected_room?.status);
  const can_publish = can_edit && !rulebook_dirty && Boolean(draft_rulebook?.start_date);
  const can_schedule = is_host && can_schedule_status
    && published_version > 0 && all_consented && selected_room?.members.length >= 2;

  const update_draft = (field, value) => {
    set_draft_rulebook((previous) => ({ ...previous, [field]: value }));
    set_rulebook_dirty(true);
  };

  const issue_invite = async () => {
    const result = await mutate(`/challenge-rounds/${selected_room.round_uuid}/invites`, 'POST', {});
    if (result) set_issued_invite(result);
  };

  const copy_invite = async () => {
    const invite_text = [
      issued_invite.invite_path ? `${window.location.origin}${issued_invite.invite_path}` : null,
      `${t('초대 코드')}: ${issued_invite.code}`,
    ].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(invite_text);
      set_error_message('');
    } catch {
      set_error_message(t('초대 링크를 복사할 수 없습니다. 코드를 직접 공유해 주세요.'));
    }
  };

  const update_invite_code = (event) => {
    const raw_invite_code = event.target.value;
    const cursor_position = event.target.selectionStart || raw_invite_code.length;
    const valid_chars_before_cursor = raw_invite_code
      .slice(0, cursor_position)
      .toUpperCase()
      .replace(/[^A-HJ-NP-Z2-9]/g, '')
      .length;
    const formatted_invite_code = format_invite_code(raw_invite_code);
    const formatted_cursor_position = valid_chars_before_cursor + (valid_chars_before_cursor > 4 ? 1 : 0);
    set_invite_code(formatted_invite_code);
    window.requestAnimationFrame(() => {
      invite_code_input.current?.setSelectionRange(formatted_cursor_position, formatted_cursor_position);
    });
  };

  const send_nudges = async () => {
    if (pending || !selected_room) return;
    set_pending(true);
    set_error_message('');
    set_nudge_feedback('');
    try {
      const result = await api_request(`/challenge-rounds/${selected_room.round_uuid}/nudges`, {
        method: 'POST',
        body: { request_id: window.crypto.randomUUID(), member_uuids: nudge_targets },
      });
      set_nudge_feedback(t('재촉 접수 {0}명 · 제외 {1}명', [result.accepted_count, result.skipped_user_uuids.length]));
      set_nudge_targets([]);
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
    } finally {
      set_pending(false);
    }
  };

  const move_challenge_tab = (event, current_tab) => {
    const challenge_tab_ids = ['rooms', 'create', 'inbox'];
    const key_directions = { ArrowRight: 1, ArrowLeft: -1 };
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next_tab = event.key === 'Home' ? challenge_tab_ids[0] : challenge_tab_ids.at(-1);
      set_active_tab(next_tab);
      document.getElementById(`challenge-tab-${next_tab}`)?.focus();
      return;
    }
    const direction = key_directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const current_index = challenge_tab_ids.indexOf(current_tab);
    const next_index = (current_index + direction + challenge_tab_ids.length) % challenge_tab_ids.length;
    const next_tab = challenge_tab_ids[next_index];
    set_active_tab(next_tab);
    document.getElementById(`challenge-tab-${next_tab}`)?.focus();
  };

  if (selected_room) {
    return <section className="viewPanel challengeScreen challengeRoomScreen isVisible">
      <header className="pageHeader challengePageHeader">
        <button className="backButton" type="button" onClick={() => { set_selected_room(null); set_issued_invite(null); set_active_tab('rooms'); load_rooms(); }} aria-label={t('내 챌린지 목록으로')}><MaterialIcon>arrow_back</MaterialIcon></button>
        <div><p className="eyebrow">{t('운동 모임')} · {selected_room.round_number}{t('회차')}</p><h1>{selected_room.room_name}</h1></div>
        <ChallengeStatus status={selected_room.status} />
      </header>
      {can_delete_room(selected_room, is_host) && <div className="challengeRoomActions">
        <RoomDeleteButton room={selected_room} user_is_host={is_host} pending={pending} on_delete={request_room_delete} />
      </div>}
      {error_message && <div className="requestState" role="alert"><p>{error_message}</p></div>}
      {success_message && <div className="challengeSuccess" role="status">{success_message}</div>}
      <article className="challengeCard challengeRulebookCard">
        <header className="challengeRulebookHeader">
          <div className="challengeRulebookTitle"><p className="eyebrow">{t('챌린지 약속 문서')}</p><h2>{t('룰북')}</h2><span>{selected_room.room_name} · {selected_room.round_number}{t('회차')}</span></div>
          <span className="challengeRulebookVersion">{published_version > 0 ? `v${published_version}` : t('초안')}</span>
        </header>
        {can_edit ? <div className="challengeRulebookPaper">
          <div className="challengeRulebookPaperHeading"><MaterialIcon>edit_note</MaterialIcon><span>{t('방장 편집')}</span></div>
          <div className="challengeForm">
            <div className="challengeRulebookFields">
              <label>{t('시작 날짜')}<input type="date" value={start_date} min={get_default_start_date()} onChange={(event) => { set_start_date(event.target.value); set_rulebook_dirty(true); }} /></label>
              <label>{t('회차 기간')}<select value={draft_rulebook?.duration_days || 7} onChange={(event) => update_draft('duration_days', Number(event.target.value))}><option value={7}>7{t('일')}</option><option value={14}>14{t('일')}</option><option value={28}>28{t('일')}</option></select></label>
              <div className="challengeRulebookEndDate"><span>{t('종료 날짜')}</span><strong>{get_round_end_date(start_date, draft_rulebook?.duration_days || 7) || t('종료일 미정')}</strong></div>
              <label>{t('주차별 운동 목표')}<select value={draft_rulebook?.target_count || 3} onChange={(event) => update_draft('target_count', Number(event.target.value))}>{Array.from({ length: 7 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}{t('일')}</option>)}</select></label>
              <label>{t('인증 방식')}<select value={draft_rulebook?.verification_mode || 'photo_required'} onChange={(event) => update_draft('verification_mode', event.target.value)}><option value="photo_required">{t('사진 인증 필수')}</option><option value="photo_or_manual">{t('사진 또는 수동 인증')}</option></select></label>
              <label className="challengeRulebookDescription">{t('참고 설명')}<textarea value={draft_rulebook?.description || ''} maxLength={1000} rows={3} onChange={(event) => update_draft('description', event.target.value || null)} /></label>
            </div>
            <p className="challengeRulebookNote"><MaterialIcon>info</MaterialIcon>{t('모든 참가자가 최신 룰북과 명단에 동의해야 개시를 예약할 수 있습니다.')}</p>
            <button className="wideButton secondary" type="button" disabled={pending || !rulebook_dirty} onClick={save_rulebook}>{t('룰북 저장')}</button>
            <button className="wideButton primary" type="button" disabled={pending || !can_publish} onClick={() => mutate(`/challenge-rounds/${selected_room.round_uuid}/publish`, 'POST', {}, null, { select_result: true })}>{t('룰북 게시')}</button>
          </div>
        </div> : <div className="challengeRulebookPaper">
          <div className="challengeRulebookPaperHeading"><MaterialIcon>verified</MaterialIcon><span>{t('게시된 룰북')}</span></div>
          <div className="challengeRulebookFacts">
            <div className="challengeRulebookFact"><span>{t('시작 날짜')}</span><strong>{selected_room.rulebook?.start_date || t('시작일 미정')}</strong></div>
            <div className="challengeRulebookFact"><span>{t('종료 날짜')}</span><strong>{get_round_end_date(selected_room.rulebook?.start_date, selected_room.rulebook?.duration_days) || t('종료일 미정')}</strong></div>
            <div className="challengeRulebookFact"><span>{t('회차 기간')}</span><strong>{selected_room.rulebook?.duration_days || 7}{t('일')}</strong></div>
            <div className="challengeRulebookFact"><span>{t('주차별 운동 목표')}</span><strong>{selected_room.rulebook?.target_count || 3}{t('일')}</strong></div>
            <div className="challengeRulebookFact"><span>{t('인증 방식')}</span><strong>{selected_room.rulebook?.verification_mode === 'photo_or_manual' ? t('사진 또는 수동 인증') : t('사진 인증 필수')}</strong></div>
          </div>
          {selected_room.rulebook?.description && <div className="challengeRulebookClause"><span>{t('참고 설명')}</span><p>{selected_room.rulebook.description}</p></div>}
        </div>}
        <section className="challengeRulebookRoster">
          <div className="challengeRulebookRosterHeading"><h3>{t('참가자 명단')}</h3><span>{t('명단 버전')} {selected_room.roster_version}</span></div>
          <details className="challengeProgressDetails challengeRosterDetails">
            <summary><MaterialIcon>groups</MaterialIcon><span>{t('명단 보기')}</span><small>{selected_room.member_count}/{selected_room.member_limit}{t('명')}</small><MaterialIcon className="challengeProgressChevron">expand_more</MaterialIcon></summary>
            <ul className="challengeMemberList">
              {selected_room.members.map((member) => <li key={member.user_uuid}>
                <span><strong>{member.display_name}{member.user_uuid === selected_room.host_user_uuid ? ` · ${t('방장')}` : ''}</strong><small>{member.user_uuid === user_uuid ? t('나') : t(member.participant_status === 'consented' ? '참가 동의 완료' : '룰북 확인 대기')}</small></span>
                <span className={member.consented ? 'challengeConsent isDone' : 'challengeConsent'}>{member.consented ? t('동의 완료') : t('미동의')}</span>
              </li>)}
            </ul>
          </details>
        </section>
        {published_version > 0 && published_matches_draft && !user_membership?.consented && ['draft', 'awaiting_consent'].includes(selected_room.status) && <button className="wideButton primary challengeRulebookConsent" type="button" disabled={pending} onClick={() => mutate(`/challenge-rounds/${selected_room.round_uuid}/consents`, 'POST', {}, null, { select_result: true })}>{t('룰북과 참가자 명단에 동의')}</button>}
      </article>
      <ChallengeQuestions key={`${selected_room.round_uuid}:${user_uuid}`} round_uuid={selected_room.round_uuid} is_host={is_host} is_active={is_active} can_write={Boolean(user_membership) && !['invited', 'removed', 'withdrawn'].includes(user_membership.participant_status) && selected_room.status !== 'cancelled'} on_unauthorized={on_unauthorized} />
      {progress_data && <article className="challengeCard">
        <div className="sectionHeading challengeProgressHeading"><div><p className="eyebrow">{t('챌린지 리포트')}</p><h2>{t(progress_data.status === 'completed' ? '회차 결과' : '운동 진행 현황')}</h2></div><span className="challengeLiveStatus"><span className={'challengeLiveDot' + (progress_loading ? ' isRefreshing' : '')} />{progress_loading ? t('갱신 중…') : t('서버 집계')}</span></div>
        <div className="challengeProgressOverview">
          <div className="challengeProgressOverviewValues">
            <span>{t(progress_data.status === 'completed' ? '전체 달성률' : '팀 목표 진행률')}</span>
            <strong>{progress_data.status === 'completed' ? progress_data.achievement_rate : progress_data.progress_percent}<small>%</small></strong>
          </div>
          <div className="challengeProgressTrack" role="progressbar" aria-label={t(progress_data.status === 'completed' ? '전체 달성률' : '팀 목표 진행률')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress_data.status === 'completed' ? progress_data.achievement_rate : progress_data.progress_percent}>
            <span style={{ width: `${Math.min(100, Math.max(0, progress_data.status === 'completed' ? progress_data.achievement_rate : progress_data.progress_percent))}%` }} />
          </div>
          <p>{progress_data.status === 'completed'
            ? <>{t('달성자')} <strong>{progress_data.achieved_count}/{progress_data.participant_count}{t('명')}</strong></>
            : <>{t('팀원 출석일')} <strong>{progress_data.credited_count}/{progress_data.target_count}{t('일')}</strong></>}</p>
        </div>
        <div className="challengeProgressPeriods">{progress_data.periods.map((period) => {
          const period_credited_count = period.members.reduce((total, member) => total + (member.credited_count ?? Math.min(member.completed_count, member.target_count)), 0);
          const period_target_count = period.target_count * period.members.length;
          const period_progress_percent = period_target_count ? Math.min(100, Math.round(period_credited_count / period_target_count * 100)) : 0;
          const period_status_label = period.status === 'upcoming' ? t('시작 전') : period.status === 'active' ? t('진행 중') : t('정산 중');
          return <section className="challengeProgressPeriod" key={period.period_index}>
            <div className="challengeProgressPeriodHeader">
              <div className="challengeProgressPeriodTitle"><span className={'challengePeriodIndex' + (period.status === 'active' ? ' isActive' : '')}>{String(period.period_index).padStart(2, '0')}</span><div><h3>{t('{0}주차', [period.period_index])}</h3><span className="challengeProgressPeriodMeta">{t('목표')} {period.target_count}{t('일')} · {period.members.length}{t('명')}</span></div></div>
              <span className={'challengePeriodStatus' + (period.status === 'active' ? ' isActive' : '')}>{period_status_label}</span>
            </div>
            <div className="challengeProgressPeriodSummary"><div className="challengeProgressPeriodTrack" aria-hidden="true"><span style={{ width: `${period_progress_percent}%` }} /></div><strong>{period_credited_count}<small> / {period_target_count}</small></strong></div>
            <details className="challengeProgressDetails">
              <summary><MaterialIcon>groups</MaterialIcon><span>{t('참가자 명단')}</span><small>{period.members.length}{t('명')}</small><MaterialIcon className="challengeProgressChevron">expand_more</MaterialIcon></summary>
              <ul className="challengeProgressMemberList">{period.members.map((member) => <ChallengeProgressMember key={member.user_uuid} member={member} is_self={member.user_uuid === user_uuid} />)}</ul>
            </details>
          </section>;
        })}</div>
      </article>}
      {is_host && ['draft', 'awaiting_consent'].includes(selected_room.status) && <article className="challengeCard">
        <div className="sectionHeading"><h2>{t('참가자 초대')}</h2></div>
        <p className="infoText">{t('초대 링크나 코드를 보낸 뒤, 참여자가 룰북에 직접 동의해야 합니다.')}</p>
        <button className="wideButton secondary" type="button" disabled={pending} onClick={issue_invite}>{t('초대 코드 확인')}</button>
        {issued_invite && <div className="challengeInviteResult"><strong>{issued_invite.code}</strong><button className="textButton" type="button" onClick={copy_invite}>{t(issued_invite.invite_path ? '링크와 코드 복사' : '초대 코드 복사')}</button><small>{issued_invite.reused ? t('이 방의 기존 초대 코드입니다.') : `${t('유효 기간')}: 7${t('일')}`}</small></div>}
      </article>}
      {is_host && can_schedule_status && <article className="challengeCard">
        <div className="sectionHeading"><h2>{t('개시 예약')}</h2></div>
        <p className="infoText">{all_consented ? t('모든 참가자가 최신 룰북에 동의했습니다.') : t('개시 전 참가자 전원의 최신 버전 동의가 필요합니다.')}</p>
        <button className="wideButton primary" type="button" disabled={pending || !can_schedule} onClick={() => mutate(`/challenge-rounds/${selected_room.round_uuid}/start`, 'POST', {}, null, { select_result: true })}>{t('회차 개시 예약')}</button>
      </article>}
      {is_host && ['settling', 'completed', 'review_required'].includes(selected_room.status) && <ChallengeMemberReports key={selected_room.round_uuid} round_uuid={selected_room.round_uuid} round_status={selected_room.status} is_active={is_active} on_unauthorized={on_unauthorized} />}
      {is_host && selected_room.status === 'completed' && <article className="challengeCard">
        <div className="sectionHeading"><h2>{t('같은 구성원과 다음 회차')}</h2></div>
        <p className="infoText">{t('확정된 회차의 룰북과 참가자를 초안으로 복사합니다. 새 기간과 룰북은 다시 게시하고 모두가 다시 동의해야 시작할 수 있습니다. 진행 중인 회차의 기간을 일방적으로 늘리지는 않습니다.')}</p>
        <button className="wideButton secondary" type="button" disabled={pending} onClick={() => mutate(`/challenge-rounds/${selected_room.round_uuid}/continuations`, 'POST', {}, null, { select_result: true })}>{t('다음 회차 초안 만들기')}</button>
      </article>}
      {is_host && progress_data?.status === 'active' && (() => {
        const active_period = progress_data.periods.find((period) => period.status === 'active');
        const eligible_members = active_period?.members.filter((member) => ['in_progress', 'at_risk'].includes(member.status) && member.user_uuid !== user_uuid) || [];
        return <article className="challengeCard">
          <div className="sectionHeading"><h2>{t('미완료 참가자 재촉')}</h2></div>
          <p className="infoText">{t('현재 구간에서 목표 미달이고 재촉 수신에 동의한 참가자만 알림을 받습니다. 1일 최대 2회, 4시간 간격 제한을 적용합니다.')}</p>
          {eligible_members.length ? <ul className="challengeMemberList">{eligible_members.map((member) => <li key={member.user_uuid}><label className="challengeNotificationOption"><input type="checkbox" checked={nudge_targets.includes(member.user_uuid)} onChange={(event) => set_nudge_targets((current) => event.target.checked ? [...current, member.user_uuid] : current.filter((target_uuid) => target_uuid !== member.user_uuid))} /><span><strong>{member.display_name}</strong><small>{member.completed_count}/{member.target_count}{t('일')} · {get_progress_status_label(t, member.status)}</small></span></label></li>)}</ul> : <p className="emptyState">{t('현재 재촉할 수 있는 참가자가 없습니다.')}</p>}
          {nudge_feedback && <p className="challengeSuccess" role="status">{nudge_feedback}</p>}
          <button className="wideButton secondary" type="button" disabled={pending || !nudge_targets.length} onClick={send_nudges}>{t('선택한 참가자 재촉')}</button>
        </article>;
      })()}
      <button className="quietButton refreshButton" type="button" disabled={pending} onClick={() => load_room(selected_room.room_uuid)}><MaterialIcon>refresh</MaterialIcon>{t('최신 상태 불러오기')}</button>
      {delete_confirmation_modal}
    </section>;
  }

  return <section className="viewPanel challengeScreen isVisible">
    <header className="pageHeader"><div><p className="eyebrow">{t('같이 지키는 운동 약속')}</p><h1>{t('내 챌린지')}</h1></div><button className="backButton" type="button" onClick={on_back} aria-label={t('오늘 화면으로')}><MaterialIcon>close</MaterialIcon></button></header>
    {error_message && <div className="requestState" role="alert"><p>{error_message}</p></div>}
    {success_message && <div className="challengeSuccess" role="status">{success_message}</div>}
    <div className="challengeTabs" role="tablist" aria-label={t('내 챌린지 메뉴')}>
      {[
        ['rooms', '참여 중인 방'],
        ['create', '방 만들기'],
        ['inbox', '알림함'],
      ].map(([tab_id, tab_label]) => <button
        key={tab_id}
        id={`challenge-tab-${tab_id}`}
        className={'challengeTab' + (active_tab === tab_id ? ' isActive' : '')}
        type="button"
        role="tab"
        aria-selected={active_tab === tab_id}
        aria-controls={`challenge-panel-${tab_id}`}
        onClick={() => set_active_tab(tab_id)}
        onKeyDown={(event) => move_challenge_tab(event, tab_id)}
      >{t(tab_label)}</button>)}
    </div>
    {active_tab === 'rooms' && <section id="challenge-panel-rooms" className="challengeTabPanel" role="tabpanel" aria-labelledby="challenge-tab-rooms">
      <article className="challengeCard"><div className="sectionHeading"><h2>{t('참여 중인 방')}</h2><div className="challengePanelActions"><button className="quietButton" type="button" disabled={pending} onClick={() => set_show_invite_form((is_visible) => !is_visible)}><MaterialIcon>key</MaterialIcon>{t(show_invite_form ? '코드 입력 닫기' : '초대 코드로 참여')}</button><button className="quietButton" type="button" disabled={list_loading} onClick={() => load_rooms()} aria-label={t('방 목록 새로고침')}><MaterialIcon>refresh</MaterialIcon></button></div></div>
        {show_invite_form && <form className="challengeForm challengeInviteForm" onSubmit={join_room}>
          <label>{t('초대 코드')}<input ref={invite_code_input} value={invite_code} maxLength={9} autoCapitalize="characters" autoComplete="off" inputMode="text" required onChange={update_invite_code} placeholder="AB7K-9Q2M" /></label>
          <button className="wideButton secondary" type="submit" disabled={pending || invite_code.replace('-', '').length !== 8}>{t('초대 방 참여')}</button>
        </form>}
        {list_loading ? <p className="infoText">{t('불러오는 중…')}</p> : rooms.length ? <ul className="challengeRoomList">{rooms.map((room) => <li key={room.round_uuid}>
          <button type="button" className="challengeRoomRow" onClick={() => load_room(room.room_uuid)} disabled={pending}><span><strong>{room.name}</strong><small>{room.round_number}{t('회차')} · {room.member_count}{t('명')}</small></span><span className="challengeRoomMeta"><ChallengeStatus status={room.status} /><MaterialIcon>chevron_right</MaterialIcon></span></button>
          <RoomDeleteButton room={room} user_is_host={room.is_host} pending={pending} on_delete={request_room_delete} />
        </li>)}</ul> : <p className="emptyState">{t('아직 참여 중인 방이 없습니다. 초대 코드를 입력하거나 새 방을 만들어 주세요.')}</p>}
      </article>
    </section>}
    {active_tab === 'create' && <section id="challenge-panel-create" className="challengeTabPanel" role="tabpanel" aria-labelledby="challenge-tab-create">
      <article className="challengeCard"><div className="sectionHeading"><h2>{t('방 만들기')}</h2></div><form className="challengeForm" onSubmit={create_room}>
        <label>{t('방 이름')}<input value={room_name} minLength={2} maxLength={30} required onChange={(event) => set_room_name(event.target.value)} placeholder={t('예: 퇴근 후 운동 모임')} /></label>
        <label>{t('소개')}<textarea value={room_description} maxLength={300} rows={2} onChange={(event) => set_room_description(event.target.value)} /></label>
        <label>{t('최대 인원')}<select value={room_member_limit} onChange={(event) => set_room_member_limit(Number(event.target.value))}>{Array.from({ length: 9 }, (_, index) => index + 2).map((member_limit) => <option key={member_limit} value={member_limit}>{member_limit}{t('명')}</option>)}</select></label>
        <button className="wideButton primary" type="submit" disabled={pending || room_name.trim().length < 2}>{pending ? t('저장 중…') : t('방 만들기')}</button>
      </form>
      <p className="sm-text">{t('방 이름은 2~30자, 최대 인원은 2~10명입니다. 방장은 첫 참가자로 포함됩니다. 개시하려면 방장을 포함해 2명 이상이 모이고, 모두 최신 룰북과 참가자 명단에 동의해야 합니다. 시작일은 내일부터 선택할 수 있습니다.')}</p>
      </article>
    </section>}
    {active_tab === 'inbox' && <section id="challenge-panel-inbox" className="challengeTabPanel challengeInboxPanel" role="tabpanel" aria-labelledby="challenge-tab-inbox">
      <ChallengeInbox is_active={is_active} on_unauthorized={on_unauthorized} on_open_room={load_room} />
      {notification_round_uuid ? <>
        <article className="challengeCard">
          <div className="sectionHeading"><h2>{t('방해 금지 시간 대상 방')}</h2></div>
          <div className="challengeForm"><label>{t('방 선택')}<select value={notification_round_uuid} onChange={(event) => set_notification_settings_round_uuid(event.target.value)}>{rooms.map((room) => <option key={room.round_uuid} value={room.round_uuid}>{room.name} · {room.round_number}{t('회차')}</option>)}</select></label></div>
        </article>
        <ChallengeNotificationSettings round_uuid={notification_round_uuid} on_unauthorized={on_unauthorized} />
      </> : <article className="challengeCard"><p className="emptyState">{t('알림 설정을 변경할 참여 중인 방이 없습니다.')}</p></article>}
    </section>}
    {delete_confirmation_modal}
  </section>;
}
