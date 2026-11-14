import { useEffect, useRef, useState } from 'react';
import { exercise_label } from '../../_lib/i18n';
import { api_request } from '../../_lib/api';
import useApiResource from '../../_hooks/useApiResource';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';
import RequestState from '../ui/RequestState';

export default function ExerciseResearchModal({ exercise, on_change, on_close, on_unauthorized }) {
  const { t, language, localize_message } = useLanguage();
  const [revision, set_revision] = useState(0);
  const [retry_count, set_retry_count] = useState(0);
  const [records, set_records] = useState([]);
  const [has_more, set_has_more] = useState(false);
  const [loading_more, set_loading_more] = useState(false);
  const [more_retry_count, set_more_retry_count] = useState(0);
  const [content, set_content] = useState('');
  const [editing_record_id, set_editing_record_id] = useState(null);
  const [pending, set_pending] = useState(false);
  const [error_message, set_error_message] = useState('');
  const [save_message, set_save_message] = useState('');
  const dialog_ref = useRef(null);
  const content_ref = useRef(null);
  const mutation_active_ref = useRef(false);
  const more_request_ref = useRef(null);
  const request_path = `/exercises/${exercise.exercise_source}/${exercise.exercise_id}/research-records`;
  const resource = useApiResource(request_path, revision, on_unauthorized);
  const is_busy = pending || loading_more;
  const exercise_name = exercise_label(exercise, language);
  const date_formatter = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  useEffect(() => {
    const dialog_element = dialog_ref.current;
    const previously_focused = document.activeElement;
    const previous_overflow = document.body.style.overflow;
    dialog_element.showModal();
    document.body.style.overflow = 'hidden';
    content_ref.current?.focus({ preventScroll: true });
    return () => {
      more_request_ref.current?.abort();
      dialog_element.close();
      document.body.style.overflow = previous_overflow;
      if (previously_focused?.isConnected) previously_focused.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!resource.data || resource.loaded_revision !== revision) return;
    set_records(resource.data.records);
    set_has_more(resource.data.has_more);
    set_more_retry_count(0);
  }, [resource.data, resource.loaded_revision, revision]);

  const reset_editor = () => {
    set_content('');
    set_editing_record_id(null);
  };

  const refresh_records = () => {
    set_retry_count(0);
    set_revision((value) => value + 1);
    on_change();
  };

  const save_record = async (event) => {
    event.preventDefault();
    const trimmed_content = content.trim();
    if (mutation_active_ref.current || is_busy || !trimmed_content) return;
    mutation_active_ref.current = true;
    set_pending(true);
    set_error_message('');
    set_save_message('');
    try {
      await api_request(editing_record_id ? `${request_path}/${editing_record_id}` : request_path, {
        method: editing_record_id ? 'PUT' : 'POST', body: { content: trimmed_content },
      });
      reset_editor();
      set_save_message(t('연구 기록을 저장했습니다.'));
      refresh_records();
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(error.message);
    } finally {
      mutation_active_ref.current = false;
      set_pending(false);
    }
  };

  const delete_record = async (record) => {
    if (mutation_active_ref.current || is_busy || !window.confirm(t('이 연구 기록을 삭제할까요?'))) return;
    mutation_active_ref.current = true;
    set_pending(true);
    set_error_message('');
    set_save_message('');
    try {
      await api_request(`${request_path}/${record.record_id}`, { method: 'DELETE' });
      if (editing_record_id === record.record_id) reset_editor();
      set_save_message(t('연구 기록을 삭제했습니다.'));
      refresh_records();
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(error.message);
    } finally {
      mutation_active_ref.current = false;
      set_pending(false);
    }
  };

  const load_more = async () => {
    if (is_busy || more_request_ref.current || more_retry_count >= 3) return;
    const request_controller = new AbortController();
    more_request_ref.current = request_controller;
    set_loading_more(true);
    set_error_message('');
    try {
      const next_page = await api_request(`${request_path}?offset=${records.length}`, { signal: request_controller.signal });
      if (request_controller.signal.aborted) return;
      set_records((current) => [...current, ...next_page.records]);
      set_has_more(next_page.has_more);
      set_more_retry_count(0);
    } catch (error) {
      if (request_controller.signal.aborted) return;
      if (error.status === 401) on_unauthorized();
      else set_error_message(error.message);
      set_more_retry_count((value) => value + 1);
    } finally {
      more_request_ref.current = null;
      set_loading_more(false);
    }
  };

  return <dialog className="actionModal exerciseEditorModal exerciseResearchModal" ref={dialog_ref} aria-labelledby="exercise-research-title" aria-describedby="exercise-research-description" aria-busy={is_busy}
    onCancel={(event) => { event.preventDefault(); if (!pending) on_close(); }}>
    <button className="modalCloseButton" type="button" aria-label={t('팝업 닫기')} disabled={pending} onClick={on_close}><MaterialIcon>close</MaterialIcon></button>
    <header className="exerciseEditorHeader">
      <p className="modalEyebrow">{exercise_name}</p>
      <h2 id="exercise-research-title">{t('연구 기록')}</h2>
    </header>
    <p id="exercise-research-description" className="infoText">{t('들은 조언이나 자극이 잘 온 방법을 기록해 두세요. 이 종목을 불러오면 최근 작성한 기록 한 개가 표시됩니다. 나에게만 보입니다.')}</p>
    <form className="exerciseResearchForm" onSubmit={save_record}>
      <label className="fieldLabel" htmlFor="exercise-research-content">{t(editing_record_id ? '연구 기록 수정' : '새 연구 기록')}</label>
      <textarea id="exercise-research-content" className="timeInput" ref={content_ref} rows={4} maxLength={2000} value={content} disabled={pending} required
        placeholder={t('예: 손에 힘을 덜 주고 팔꿈치를 아래로 당기니 등에 자극이 잘 왔다.')}
        onChange={(event) => { set_content(event.target.value); set_save_message(''); }} />
      <div className="exerciseResearchFormActions">
        <small>{content.length} / 2000</small>
        {editing_record_id && <button className="textButton" type="button" disabled={pending} onClick={reset_editor}>{t('취소')}</button>}
        <button className="wideButton primary" type="submit" disabled={is_busy || !content.trim()}>{t(pending ? '저장 중…' : '저장')}</button>
      </div>
    </form>
    {save_message && <p className="infoText" role="status">{save_message}</p>}
    {error_message && <p className="errorText" role="alert">{localize_message(error_message)}</p>}
    <h3 className="exerciseResearchListTitle">{t('연구 기록 목록')}<small>{t('최근 작성순')}</small></h3>
    <RequestState loading={resource.loading} error={resource.error} on_retry={retry_count < 2 ? () => {
      set_retry_count((value) => value + 1);
      set_revision((value) => value + 1);
    } : undefined} />
    {!resource.loading && !resource.error && <>
      {records.length ? <ol className="exerciseResearchList">
        {records.map((record, record_index) => <li key={record.record_id}>
          <div className="exerciseResearchRecordHeading">
            <time dateTime={record.created_at}>{date_formatter.format(new Date(record.created_at))}</time>
            {record_index === 0 && <span className="exerciseResearchLatest">{t('최근 작성')}</span>}
          </div>
          <p className="exerciseResearchContent">{record.content}</p>
          <div className="exerciseResearchRecordActions">
            <button className="textButton" type="button" aria-label={t('{0} 연구 기록 수정', [record_index + 1])} disabled={is_busy} onClick={() => {
              set_editing_record_id(record.record_id);
              set_content(record.content);
              set_error_message('');
              set_save_message('');
              content_ref.current?.focus();
            }}>{t('수정')}</button>
            <button className="textButton" type="button" aria-label={t('{0} 연구 기록 삭제', [record_index + 1])} disabled={is_busy} onClick={() => delete_record(record)}>{t('삭제')}</button>
          </div>
        </li>)}
      </ol> : <p className="emptyState">{t('아직 연구 기록이 없습니다. 이 종목의 첫 요령을 남겨 보세요.')}</p>}
      {has_more && more_retry_count < 3 && <button className="textButton" type="button" disabled={is_busy} onClick={load_more}>{t(loading_more ? '불러오는 중…' : '더 보기')}</button>}
    </>}
  </dialog>;
}
