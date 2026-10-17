'use client';

import { useEffect, useId, useRef } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';
import safety_styles from './Safety.module.css';

export default function SafetyDialog({ title, pending = false, on_close, children }) {
  const { t } = useLanguage();
  const dialog_ref = useRef(null);
  const title_id = useId();
  useEffect(() => {
    const dialog_element = dialog_ref.current;
    const previously_focused = document.activeElement;
    dialog_element.showModal();
    return () => {
      dialog_element.close();
      if (previously_focused?.isConnected) previously_focused.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog_ref} className={safety_styles.dialog} aria-labelledby={title_id}
    onCancel={(event) => { event.preventDefault(); if (!pending) on_close(); }}>
    <header className={safety_styles.dialogHeader}><h2 id={title_id}>{title}</h2>
      <button className="quietButton" type="button" disabled={pending} aria-label={t('팝업 닫기')} onClick={on_close}><MaterialIcon>close</MaterialIcon></button>
    </header>
    {children}
  </dialog>;
}
