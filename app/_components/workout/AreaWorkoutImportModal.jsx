import { useEffect, useRef, useState } from 'react';
import { api_request } from '../../_lib/api';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';

const target_areas = ['가슴', '등', '어깨', '이두', '삼두', '복근', '엉덩이', '허벅지', '종아리', '전신'];

export default function AreaWorkoutImportModal({ is_open, workout_date, on_import, on_close, on_unauthorized }) {
  const { t, localize_message } = useLanguage();
  const [pending_area, set_pending_area] = useState('');
  const [failed_area, set_failed_area] = useState('');
  const [error_message, set_error_message] = useState('');
  const [info_message, set_info_message] = useState('');
  const modal_ref = useRef(null);
  const request_controller_ref = useRef(null);
  const attempts_by_area_ref = useRef(new Map());
  const callbacks_ref = useRef({ on_import, on_close, on_unauthorized });
  callbacks_ref.current = { on_import, on_close, on_unauthorized };

  const close_modal = () => {
    request_controller_ref.current?.abort();
    request_controller_ref.current = null;
    callbacks_ref.current.on_close();
  };

  useEffect(() => {
    if (!is_open) return undefined;
    const previously_focused = document.activeElement;
    const previous_overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    attempts_by_area_ref.current.clear();
    set_pending_area('');
    set_failed_area('');
    set_error_message('');
    set_info_message('');
    modal_ref.current?.querySelector('.workoutAreaOption')?.focus();
    const handle_key_down = (event) => {
      if (event.key === 'Escape') {
        request_controller_ref.current?.abort();
        request_controller_ref.current = null;
        callbacks_ref.current.on_close();
      }
      if (event.key !== 'Tab') return;
      const focusable_elements = [...modal_ref.current.querySelectorAll('button:not(:disabled)')];
      const first_element = focusable_elements[0];
      const last_element = focusable_elements.at(-1);
      if (!focusable_elements.includes(document.activeElement)) {
        event.preventDefault();
        first_element?.focus();
      } else if (event.shiftKey && document.activeElement === first_element) {
        event.preventDefault();
        last_element?.focus();
      } else if (!event.shiftKey && document.activeElement === last_element) {
        event.preventDefault();
        first_element?.focus();
      }
    };
    document.addEventListener('keydown', handle_key_down);
    return () => {
      request_controller_ref.current?.abort();
      request_controller_ref.current = null;
      document.removeEventListener('keydown', handle_key_down);
      document.body.style.overflow = previous_overflow;
      if (previously_focused?.isConnected) previously_focused.focus();
    };
  }, [is_open, workout_date]);

  const import_area = async (target_area) => {
    const attempt_count = attempts_by_area_ref.current.get(target_area) || 0;
    if (request_controller_ref.current || attempt_count >= 3) return;
    attempts_by_area_ref.current.set(target_area, attempt_count + 1);
    const request_controller = new AbortController();
    request_controller_ref.current = request_controller;
    set_pending_area(target_area);
    set_failed_area('');
    set_error_message('');
    set_info_message('');
    try {
      const import_result = await api_request(
        `/sessions/by-date/${workout_date}/area-import?target_area=${encodeURIComponent(target_area)}`,
        { signal: request_controller.signal },
      );
      if (request_controller.signal.aborted || request_controller_ref.current !== request_controller) return;
      if (!import_result.exercise_groups.length) {
        set_info_message(import_result.session_count === 0
          ? t('이 부위의 이전 운동 기록이 없습니다.')
          : import_result.session_count === 1
            ? t('서로 다른 운동 기록 2회가 필요합니다.')
            : t('최근 같은 부위 운동에서 2회 이상 기록한 종목이 없습니다.'));
        return;
      }
      const merge_result = callbacks_ref.current.on_import(import_result);
      if (merge_result.error_message) set_error_message(merge_result.error_message);
      else if (merge_result.info_message) set_info_message(merge_result.info_message);
      else close_modal();
    } catch (error) {
      if (request_controller.signal.aborted) return;
      if (error.status === 401) callbacks_ref.current.on_unauthorized();
      else {
        set_failed_area(target_area);
        set_error_message(error.message);
      }
    } finally {
      if (request_controller_ref.current === request_controller) {
        request_controller_ref.current = null;
        set_pending_area('');
      }
    }
  };

  if (!is_open) return null;
  const failed_attempt_count = attempts_by_area_ref.current.get(failed_area) || 0;
  return <div className="modalBackdrop exercisePickerBackdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) close_modal();
  }}>
    <section className="actionModal exercisePickerModal" ref={modal_ref} role="dialog" aria-modal="true" aria-labelledby="area-import-title" aria-describedby="area-import-description" aria-busy={Boolean(pending_area)}>
      <button className="modalCloseButton" type="button" aria-label={t('팝업 닫기')} onClick={close_modal}><MaterialIcon>close</MaterialIcon></button>
      <div className="exercisePickerHeader">
        <p className="modalEyebrow">{t('기록 날짜')} · {workout_date}</p>
        <h2 id="area-import-title">{t('부위별 불러오기')}</h2>
        <p id="area-import-description" className="modalMessage">{t('부위를 선택하면 최근 같은 부위 운동 3회 중 2회 이상 기록한 종목과 최신 세트를 추가합니다.')}</p>
      </div>
      <div className="workoutAreaImportContent">
        <div className="workoutAreaGrid" role="group" aria-label={t('타겟 부위')}>
          {target_areas.map((target_area) => <button className="workoutAreaOption" type="button" key={target_area} disabled={Boolean(pending_area) || (attempts_by_area_ref.current.get(target_area) || 0) >= 3} onClick={() => { void import_area(target_area); }}>
            <span>{t(target_area)}</span><MaterialIcon>{pending_area === target_area ? 'hourglass_top' : 'playlist_add'}</MaterialIcon>
          </button>)}
        </div>
        <p className="infoText">{t('추가된 숫자는 실제 운동에 맞게 수정하고, 하지 않은 종목은 삭제해 주세요.')}</p>
        {pending_area && <p className="infoText" role="status">{t('{0} 운동 기록을 불러오는 중…', [t(pending_area)])}</p>}
        {info_message && <p className="infoText" role="status">{localize_message(info_message)}</p>}
        {error_message && <div className="errorText" role="alert">
          <p>{localize_message(error_message)}</p>
          {failed_area && (failed_attempt_count < 3
            ? <button className="textButton" type="button" disabled={Boolean(pending_area)} onClick={() => { void import_area(failed_area); }}>{t('다시 불러오기')} ({3 - failed_attempt_count})</button>
            : <p>{t('불러오기 재시도 한도에 도달했습니다.')}</p>)}
        </div>}
      </div>
    </section>
  </div>;
}
