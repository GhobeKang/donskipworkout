import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';
import ExerciseClassificationFields from './ExerciseClassificationFields';

export default function ExerciseEditorModal({ exercise, pending, error_message, on_save, on_close }) {
  const { t, localize_message } = useLanguage();
  const [name, set_name] = useState(exercise?.name || '');
  const [target_area, set_target_area] = useState(exercise?.target_area || '');
  const [target_subarea, set_target_subarea] = useState(exercise?.target_subarea || '');
  const dialog_ref = useRef(null);
  const name_input_ref = useRef(null);

  useEffect(() => {
    const dialog_element = dialog_ref.current;
    const previously_focused = document.activeElement;
    const previous_overflow = document.body.style.overflow;
    dialog_element.showModal();
    document.body.style.overflow = 'hidden';
    name_input_ref.current?.focus({ preventScroll: true });
    return () => {
      dialog_element.close();
      document.body.style.overflow = previous_overflow;
      if (previously_focused?.isConnected) previously_focused.focus({ preventScroll: true });
    };
  }, []);

  const save_exercise = (event) => {
    event.preventDefault();
    const trimmed_name = name.trim();
    if (!trimmed_name || !target_area || pending) return;
    on_save({ name: trimmed_name, target_area, target_subarea: target_subarea || null });
  };

  return <dialog className="actionModal exerciseEditorModal" ref={dialog_ref} aria-labelledby="exercise-editor-title" aria-busy={pending}
    onCancel={(event) => { event.preventDefault(); if (!pending) on_close(); }}
    onClick={(event) => {
      if (pending || event.target !== event.currentTarget) return;
      const dialog_bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < dialog_bounds.left || event.clientX > dialog_bounds.right || event.clientY < dialog_bounds.top || event.clientY > dialog_bounds.bottom) on_close();
    }}>
    <button className="modalCloseButton" type="button" aria-label={t('팝업 닫기')} disabled={pending} onClick={on_close}><MaterialIcon>close</MaterialIcon></button>
    <header className="exerciseEditorHeader">
      <p className="modalEyebrow">{t('운동 종목 관리')}</p>
      <h2 id="exercise-editor-title">{t(exercise ? '운동 종목 수정' : '운동 종목 추가')}</h2>
    </header>
    <form onSubmit={save_exercise}>
      <label className="fieldLabel" htmlFor="exercise-name">{t('운동 종목 이름')}</label>
      <input id="exercise-name" className="timeInput" ref={name_input_ref} value={name} maxLength={100} disabled={pending} onChange={(event) => set_name(event.target.value)} placeholder={t('예: 케이블 크런치')} required />
      <ExerciseClassificationFields target_area={target_area} target_subarea={target_subarea} disabled={pending} on_area_change={set_target_area} on_subarea_change={set_target_subarea} />
      {error_message && <p className="errorText" role="alert">{localize_message(error_message)}</p>}
      <div className="modalActions exerciseEditorActions">
        <button className="textButton" type="button" disabled={pending} onClick={on_close}>{t('취소')}</button>
        <button className="wideButton primary" type="submit" disabled={!name.trim() || !target_area || pending}>{t(pending ? '저장 중…' : exercise ? '수정' : '추가')}</button>
      </div>
    </form>
  </dialog>;
}
