import { useLanguage } from '../../_hooks/useLanguage';
import { useEffect, useRef } from 'react';
import MaterialIcon from './MaterialIcon';

const action_content_by_action = {
  snooze: {
    icon: 'schedule',
    eyebrow: '딱 한 번만.',
    title: '30분. 그다음은 출발.',
    message: '오늘 미루기는 여기까지. 30분 뒤로 운동 약속을 옮깁니다.',
    detail: '30분 뒤로 미룰까요?',
    confirm_label: '30분 미루기',
  },
  rest: {
    icon: 'self_improvement',
    eyebrow: '회복도 실력.',
    title: '쉴 땐 제대로 쉬어.',
    message: '오늘을 휴식으로 기록합니다. 출석 횟수에는 포함하지 않으며, 오늘의 상태는 바꿀 수 없습니다.',
    detail: '오늘을 휴식으로 기록할까요?',
    confirm_label: '오늘은 휴식하기',
  },
};

export default function ActionModal({ action, pending, on_confirm, on_close }) {
  const { t } = useLanguage();
  const confirm_button_ref = useRef(null);
  const modal_ref = useRef(null);
  const on_close_ref = useRef(on_close);
  on_close_ref.current = on_close;
  const action_content = action_content_by_action[action];

  useEffect(() => {
    if (!action_content) return undefined;
    const previously_focused = document.activeElement;
    confirm_button_ref.current?.focus();
    const handle_key_down = (event) => {
      if (event.key === 'Escape' && !pending) on_close_ref.current();
      if (event.key === 'Tab') {
        const focusable_elements = [...modal_ref.current.querySelectorAll('button:not(:disabled)')];
        const first_element = focusable_elements[0];
        const last_element = focusable_elements.at(-1);
        if (event.shiftKey && document.activeElement === first_element) { event.preventDefault(); last_element?.focus(); }
        else if (!event.shiftKey && document.activeElement === last_element) { event.preventDefault(); first_element?.focus(); }
      }
    };
    document.addEventListener('keydown', handle_key_down);
    return () => { document.removeEventListener('keydown', handle_key_down); previously_focused?.focus(); };
  }, [action_content, pending]);

  if (!action_content) return null;

  return <div className="modalBackdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !pending) on_close();
  }}>
    <section className="actionModal" ref={modal_ref} role="dialog" aria-modal="true" aria-labelledby="action-modal-title" aria-describedby="action-modal-message">
      <div className="modalHandle" aria-hidden="true" />
      <button className="modalCloseButton" type="button" aria-label={t("팝업 닫기")} disabled={pending} onClick={on_close}><MaterialIcon>close</MaterialIcon></button>
      <span className="modalIcon"><MaterialIcon>{action_content.icon}</MaterialIcon></span>
      <p className="modalEyebrow">{t(action_content.eyebrow)}</p>
      <h2 id="action-modal-title">{t(action_content.title)}</h2>
      <p id="action-modal-message" className="modalMessage">{t(action_content.message)}</p>
      <p className="modalDetail">{t(action_content.detail)}</p>
      <div className="modalActions">
        <button className="textButton modalCancelButton" type="button" disabled={pending} onClick={on_close}>{t("다음에 결정")}</button>
        <button className="wideButton primary modalConfirmButton" type="button" disabled={pending} ref={confirm_button_ref} onClick={() => on_confirm(action)}>
          <MaterialIcon>{pending ? 'progress_activity' : action_content.icon}</MaterialIcon>{pending ? t("기록 중…") : t(action_content.confirm_label)}
        </button>
      </div>
    </section>
  </div>;
}
