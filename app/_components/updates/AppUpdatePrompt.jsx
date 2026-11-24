'use client';

import { useEffect, useId, useRef, useState } from 'react';
import useAppUpdate from '../../_hooks/useAppUpdate';
import { useLanguage } from '../../_hooks/useLanguage';
import { open_app_update } from '../../_lib/appUpdates';
import MaterialIcon from '../ui/MaterialIcon';
import update_styles from './AppUpdatePrompt.module.css';

export default function AppUpdatePrompt() {
  const { available_update, dismiss_update } = useAppUpdate();
  if (!available_update) return null;
  return <AppUpdateDialog key={available_update.release_key} release={available_update} on_close={dismiss_update} />;
}

function AppUpdateDialog({ release, on_close }) {
  const { t } = useLanguage();
  const dialog_ref = useRef(null);
  const mounted_ref = useRef(false);
  const opening_ref = useRef(false);
  const [pending, set_pending] = useState(false);
  const [open_error, set_open_error] = useState(false);
  const title_id = useId();
  const message_id = useId();

  useEffect(() => {
    mounted_ref.current = true;
    const dialog_element = dialog_ref.current;
    const previously_focused = document.activeElement;
    dialog_element.showModal();
    return () => {
      mounted_ref.current = false;
      dialog_element.close();
      if (previously_focused?.isConnected) previously_focused.focus({ preventScroll: true });
    };
  }, []);

  const update_app = async () => {
    if (opening_ref.current) return;
    opening_ref.current = true;
    set_pending(true);
    set_open_error(false);
    try {
      await open_app_update(release.store_url, release.platform, release.app_info.id);
      if (mounted_ref.current) on_close();
    } catch (error) {
      console.warn('[APP_UPDATE_OPEN_ERROR]', error.name);
      if (mounted_ref.current) set_open_error(true);
    } finally {
      opening_ref.current = false;
      if (mounted_ref.current) set_pending(false);
    }
  };

  return <dialog ref={dialog_ref} className={`actionModal ${update_styles.updateDialog}`}
    aria-labelledby={title_id} aria-describedby={message_id} aria-busy={pending} tabIndex={-1}
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const dialog_element = event.currentTarget;
      const focusable_buttons = [...dialog_element.querySelectorAll('button:not(:disabled)')];
      const first_button = focusable_buttons[0];
      const last_button = focusable_buttons.at(-1);
      if (!first_button) {
        event.preventDefault();
        dialog_element.focus();
      } else if (event.shiftKey && document.activeElement === first_button) {
        event.preventDefault();
        last_button.focus();
      } else if (!event.shiftKey && document.activeElement === last_button) {
        event.preventDefault();
        first_button.focus();
      }
    }}
    onCancel={(event) => { event.preventDefault(); if (!pending) on_close(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget || pending) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom) on_close();
    }}>
    <button className="modalCloseButton" type="button" aria-label={t('팝업 닫기')} disabled={pending} onClick={on_close}>
      <MaterialIcon>close</MaterialIcon>
    </button>
    <span className="modalIcon"><MaterialIcon>system_update</MaterialIcon></span>
    <p className="modalEyebrow">{t('새 버전 안내')}</p>
    <h2 id={title_id}>{t('업데이트가 있어요')}</h2>
    <p id={message_id} className="modalMessage">{t('새 버전이 출시되었어요. 스토어에서 업데이트해 주세요.')}</p>
    <p className={update_styles.versionInfo}>{t('현재 {0} → 최신 {1}', [release.app_info.version, release.latest_version])}</p>
    {release.latest_version === release.app_info.version && release.latest_build && <p className={update_styles.buildInfo}>
      {t('빌드 {0} → {1}', [release.app_info.build, release.latest_build])}
    </p>}
    <p className={update_styles.snoozeHint}>{t('나중에를 선택하면 이 버전의 알림을 하루 동안 숨겨요.')}</p>
    {open_error && <p className={update_styles.openError} role="alert">{t('스토어를 열지 못했어요. 잠시 후 다시 시도해 주세요.')}</p>}
    <div className="modalActions">
      <button className="textButton" type="button" disabled={pending} onClick={on_close}>{t('나중에')}</button>
      <button className="wideButton primary modalConfirmButton" type="button" disabled={pending} onClick={update_app}>
        <MaterialIcon>{pending ? 'progress_activity' : 'system_update'}</MaterialIcon>
        {t(pending ? '스토어 여는 중…' : '업데이트')}
      </button>
    </div>
  </dialog>;
}
