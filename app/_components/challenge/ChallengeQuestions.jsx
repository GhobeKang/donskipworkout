'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { api_request } from '../../_lib/api';
import SafetyActions from '../safety/SafetyActions';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';

const question_categories = [
  ['technique', '자세·방법', '스쿼트할 때 상체가 앞으로 기울어요. 자세를 어떻게 바꾸면 좋을까요?'],
  ['muscle', '자극·부위', '등 운동을 하는데 팔에만 힘이 들어가요. 등 자극을 느끼는 방법이 궁금해요.'],
  ['coaching', '지도 요청', '주 3회 운동을 시작했어요. 제 수준에 맞는 루틴과 자세 지도를 부탁드려요.'],
  ['request', '기타 요청', '운동 시간이나 준비물 등 방장에게 부탁하고 싶은 내용을 남겨 주세요.'],
];

function QuestionComposer({ is_question = false, is_host = false, on_submit }) {
  const { t } = useLanguage();
  const field_id = useId();
  const [category, set_category] = useState('technique');
  const [body, set_body] = useState('');
  const [pending, set_pending] = useState(false);
  const submission = useRef(null);
  const submitting = useRef(false);
  const submit_message = async (event) => {
    event.preventDefault();
    if (submitting.current || !body.trim()) return;
    submitting.current = true;
    set_pending(true);
    submission.current ||= { request_id: window.crypto.randomUUID(), body: body.trim(), ...(is_question ? { category } : {}) };
    try {
      if (await on_submit(submission.current)) {
        set_body('');
        submission.current = null;
      }
    } finally {
      submitting.current = false;
      set_pending(false);
    }
  };
  return <form className="questionComposer" onSubmit={submit_message}>
    {is_question && <fieldset disabled={pending}>
      <legend>{t('어떤 도움이 필요한가요?')}</legend>
      <div className="questionCategories">{question_categories.map(([value, label]) => <label key={value} className={category === value ? 'isSelected' : ''}>
        <input type="radio" name={`${field_id}-category`} value={value} checked={category === value} onChange={() => { set_category(value); submission.current = null; }} />{t(label)}
      </label>)}</div>
    </fieldset>}
    <label htmlFor={field_id}>{t(is_question ? '질문·요청 내용' : is_host ? '참가자에게 답변' : '추가로 질문하기')}</label>
    <textarea id={field_id} rows={is_question ? 5 : 3} maxLength={2000} required disabled={pending} value={body}
      placeholder={t(is_question ? question_categories.find(([value]) => value === category)[2] : '이 대화는 작성자와 방장에게만 보입니다.')}
      onChange={(event) => { set_body(event.target.value); submission.current = null; }} />
    <div className="questionComposerHint"><span>{t(is_question ? '운동 이름과 부위, 시도한 방법을 함께 적으면 답변에 도움이 돼요.' : '작성자와 방장만 확인할 수 있어요.')}</span><small>{body.length}/2,000</small></div>
    <button className="wideButton primary" type="submit" disabled={pending || !body.trim()}><MaterialIcon>send</MaterialIcon>{t(pending ? '보내는 중…' : is_question ? '방장에게 보내기' : '메시지 보내기')}</button>
  </form>;
}

function QuestionConversation({ round_uuid, question_uuid, user_uuid, is_host, is_active, on_back, on_unauthorized, on_blocked }) {
  const { t, language, localize_message } = useLanguage();
  const [question, set_question] = useState(null);
  const [loading, set_loading] = useState(false);
  const [error_message, set_error_message] = useState('');
  const [notice, set_notice] = useState('');
  const request_controller = useRef(null);
  const message_end = useRef(null);
  const question_path = `/challenge-rounds/${round_uuid}/questions/${question_uuid}`;
  const format_date = (value) => new Date(value).toLocaleString(language === 'en' ? 'en-US' : 'ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const load_question = useCallback(async (cursor = null) => {
    request_controller.current?.abort();
    const controller = new AbortController();
    request_controller.current = controller;
    set_loading(true);
    set_error_message('');
    try {
      const result = await api_request(`${question_path}${cursor ? `?before_id=${cursor}` : ''}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      set_question((current) => cursor && current ? { ...result, replies: [...result.replies, ...current.replies] } : result);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.status === 401) on_unauthorized();
      else { set_error_message(localize_message(error.message)); if ([403, 404].includes(error.status)) set_question(null); }
    } finally {
      if (!controller.signal.aborted) set_loading(false);
    }
  }, [question_path, localize_message, on_unauthorized]);
  useEffect(() => {
    if (is_active) load_question();
    return () => request_controller.current?.abort();
  }, [is_active, load_question]);
  const send_reply = async (payload) => {
    set_error_message('');
    set_notice('');
    try {
      await api_request(`${question_path}/replies`, { method: 'POST', body: payload });
      set_notice(t('메시지를 보냈습니다.'));
      await load_question();
      message_end.current?.scrollIntoView({ block: 'nearest' });
      return true;
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
      return false;
    }
  };
  return <div className="questionConversation">
    <div className="questionToolbar"><button className="quietButton" type="button" onClick={on_back}><MaterialIcon>arrow_back</MaterialIcon>{t('문의 목록')}</button><button className="quietButton" type="button" disabled={loading} onClick={() => load_question()} aria-label={t('대화 새로고침')}><MaterialIcon>refresh</MaterialIcon></button></div>
    {error_message && <p className="requestState" role="alert">{error_message}</p>}
    {loading && <p className="infoText" role="status">{t('불러오는 중…')}</p>}
    {question && <>
      <SafetyActions content_type="user" content_id={is_host ? question.author_uuid : question.host_uuid} target_user_uuid={is_host ? question.author_uuid : question.host_uuid} on_unauthorized={on_unauthorized} on_blocked={on_blocked} />
      <div className="questionOriginal"><span className="questionCategory">{t(question_categories.find(([value]) => value === question.category)?.[1] || '기타 요청')}</span><h3>{question.author_name}</h3><p>{question.body}</p><time dateTime={question.created_at}>{format_date(question.created_at)}</time></div>
      {question.author_uuid !== user_uuid && !question.is_removed && <SafetyActions content_type="question" content_id={question.question_uuid} on_unauthorized={on_unauthorized} />}
      {question.next_cursor && <button className="quietButton" type="button" disabled={loading} onClick={() => load_question(question.next_cursor)}>{t('이전 메시지 보기')}</button>}
      <ol className="questionMessages">{question.replies.map((reply) => <li key={reply.reply_id} className={reply.is_host ? 'isHost' : ''}><div><strong>{t(reply.is_host ? '방장' : '참가자')}</strong><time dateTime={reply.created_at}>{format_date(reply.created_at)}</time></div><p>{reply.body}</p>{reply.sender_uuid !== user_uuid && !reply.is_removed && <SafetyActions content_type="reply" content_id={reply.reply_id} on_unauthorized={on_unauthorized} />}</li>)}</ol>
      <div ref={message_end} />
      {notice && <p className="challengeSuccess" role="status">{notice}</p>}
      {question.can_reply ? <QuestionComposer is_host={is_host} on_submit={send_reply} /> : <p className="infoText">{t('이 대화는 조회만 가능합니다.')}</p>}
    </>}
  </div>;
}

export default function ChallengeQuestions({ round_uuid, user_uuid, is_host, is_active, can_write, on_unauthorized, on_blocked }) {
  const { t, localize_message } = useLanguage();
  const [panel_open, set_panel_open] = useState(false);
  const [show_composer, set_show_composer] = useState(false);
  const [questions, set_questions] = useState([]);
  const [next_cursor, set_next_cursor] = useState(null);
  const [selected_question, set_selected_question] = useState(null);
  const [loading, set_loading] = useState(false);
  const [error_message, set_error_message] = useState('');
  const request_controller = useRef(null);
  const dialog_ref = useRef(null);
  const dialog_id = useId();
  useEffect(() => {
    if (!panel_open || !is_active) return undefined;
    const dialog_element = dialog_ref.current;
    const previous_overflow = document.body.style.overflow;
    dialog_element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog_element.close();
      document.body.style.overflow = previous_overflow;
    };
  }, [panel_open, is_active]);
  const load_questions = useCallback(async (cursor = null) => {
    request_controller.current?.abort();
    const controller = new AbortController();
    request_controller.current = controller;
    set_loading(true);
    set_error_message('');
    try {
      const result = await api_request(`/challenge-rounds/${round_uuid}/questions${cursor ? `?before_id=${cursor}` : ''}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      set_questions((current) => cursor ? [...current, ...result.questions] : result.questions);
      set_next_cursor(result.next_cursor);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.status === 401) on_unauthorized();
      else { set_error_message(localize_message(error.message)); if ([403, 404].includes(error.status)) set_questions([]); }
    } finally {
      if (!controller.signal.aborted) set_loading(false);
    }
  }, [round_uuid, localize_message, on_unauthorized]);
  useEffect(() => {
    if (is_active && panel_open && !selected_question) load_questions();
    return () => request_controller.current?.abort();
  }, [is_active, panel_open, selected_question, load_questions]);
  const create_question = async (payload) => {
    set_error_message('');
    try {
      const result = await api_request(`/challenge-rounds/${round_uuid}/questions`, { method: 'POST', body: payload });
      set_show_composer(false);
      set_selected_question(result.question_uuid);
      return true;
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
      return false;
    }
  };
  return <>
    {is_active && <div className="questionFloatingActions">
      <button className="questionFloatingButton" type="button" aria-haspopup="dialog" aria-controls={dialog_id} aria-expanded={panel_open} onClick={() => set_panel_open(true)}>
        <MaterialIcon>chat_bubble</MaterialIcon><span>{t(is_host ? '참가자 운동 상담' : '방장에게 질문하기')}</span>
      </button>
    </div>}
    <dialog className="questionDialog" id={dialog_id} ref={dialog_ref} aria-labelledby={`${dialog_id}-title`} aria-describedby={`${dialog_id}-privacy`}
      onCancel={(event) => { event.preventDefault(); set_panel_open(false); }} onClose={() => set_panel_open(false)}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const focusable_elements = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')]
          .filter((element) => element.getClientRects().length > 0);
        const first_element = focusable_elements[0];
        const last_element = focusable_elements.at(-1);
        if (event.shiftKey && document.activeElement === first_element) { event.preventDefault(); last_element?.focus(); }
        else if (!event.shiftKey && document.activeElement === last_element) { event.preventDefault(); first_element?.focus(); }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const dialog_bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < dialog_bounds.left || event.clientX > dialog_bounds.right || event.clientY < dialog_bounds.top || event.clientY > dialog_bounds.bottom) set_panel_open(false);
      }}>
      <header className="questionDialogHeader">
        <div><p className="eyebrow">{t('질문·요청·운동 지도')}</p><h2 id={`${dialog_id}-title`}>{t(is_host ? '참가자 운동 상담' : '방장에게 질문하기')}</h2></div>
        <button className="backButton" type="button" aria-label={t('팝업 닫기')} onClick={() => set_panel_open(false)}><MaterialIcon>close</MaterialIcon></button>
      </header>
      <div className="questionDialogBody">
      <p className="questionPrivacy" id={`${dialog_id}-privacy`}><MaterialIcon>lock</MaterialIcon>{t('질문과 답변은 작성자와 방장만 볼 수 있어요. 다른 참가자에게는 공개되지 않아요.')}</p>
      {selected_question ? <QuestionConversation key={selected_question} round_uuid={round_uuid} question_uuid={selected_question} user_uuid={user_uuid} is_host={is_host} is_active={is_active && panel_open} on_back={() => set_selected_question(null)} on_unauthorized={on_unauthorized} on_blocked={on_blocked} /> : <>
        {!is_host && can_write && <button className="wideButton secondary" type="button" aria-expanded={show_composer} onClick={() => set_show_composer((current) => !current)}><MaterialIcon>{show_composer ? 'close' : 'edit_square'}</MaterialIcon>{t(show_composer ? '작성란 접기' : '새 질문 남기기')}</button>}
        {error_message && <p className="requestState" role="alert">{error_message}</p>}
        <div hidden={!show_composer}>{!is_host && can_write && <QuestionComposer is_question on_submit={create_question} />}</div>
        <div className="questionToolbar"><h3>{t(is_host ? '받은 질문' : '내 질문')}</h3><button className="quietButton" type="button" disabled={loading} onClick={() => load_questions()} aria-label={t('문의 새로고침')}><MaterialIcon>refresh</MaterialIcon></button></div>
        {loading && <p className="infoText" role="status">{t('불러오는 중…')}</p>}
        {!loading && !error_message && !questions.length && <p className="questionEmpty">{t(is_host ? '아직 받은 질문이 없어요. 참가자의 질문이 도착하면 여기서 답변할 수 있어요.' : '혼자 고민하지 말고 물어보세요. 자세나 자극이 궁금할 때, 운동 지도가 필요할 때 편하게 남겨 주세요.')}</p>}
        <ul className="questionList">{questions.map((question) => <li key={question.question_uuid}><button type="button" onClick={() => set_selected_question(question.question_uuid)}>
          <span className="questionListMeta"><span>{t(question_categories.find(([value]) => value === question.category)?.[1] || '기타 요청')}</span><span className={question.awaiting_host ? 'questionState isWaiting' : 'questionState'}>{t(question.awaiting_host ? '답변 대기' : '답변 완료')}</span></span>
          {is_host && <strong>{question.author_name}</strong>}<p>{question.preview}</p><span className="questionListFooter"><time dateTime={question.updated_at}>{question.updated_at.slice(0, 10)}</time><MaterialIcon>chevron_right</MaterialIcon></span>
        </button></li>)}</ul>
        {next_cursor && <button className="quietButton refreshButton" type="button" disabled={loading} onClick={() => load_questions(next_cursor)}>{t('이전 질문 더 보기')}</button>}
      </>}
      </div>
    </dialog>
  </>;
}
