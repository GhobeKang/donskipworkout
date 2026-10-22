import { useLanguage } from '../../_hooks/useLanguage';
import { useEffect, useRef, useState } from 'react';
import { api_request } from '../../_lib/api';
import { export_workout_photo, photo_export_filename } from '../../_lib/photoExport';
import MaterialIcon from '../ui/MaterialIcon';

export default function SavedPhoto({ photo_path, workout_date, alt }) {
  const { t, localize_message } = useLanguage();
  const [photo_data, set_photo_data] = useState(null);
  const [error_message, set_error_message] = useState('');
  const [revision, set_revision] = useState(0);
  const [export_pending, set_export_pending] = useState(false);
  const [export_feedback, set_export_feedback] = useState(null);
  const export_lock_ref = useRef(false);
  const current_photo_path_ref = useRef(photo_path);
  current_photo_path_ref.current = photo_path;
  const current_photo = photo_data?.photo_path === photo_path ? photo_data : null;
  useEffect(() => {
    const controller = new AbortController();
    let object_url = '';
    set_photo_data(null);
    set_error_message('');
    set_export_feedback(null);
    api_request(photo_path, { signal: controller.signal, response_type: 'blob' }).then((photo_blob) => {
      if (controller.signal.aborted) return;
      object_url = URL.createObjectURL(photo_blob);
      set_photo_data({ photo_path, photo_blob, photo_url: object_url });
    }).catch((error) => { if (!controller.signal.aborted) set_error_message(error.message); });
    return () => { controller.abort(); if (object_url) URL.revokeObjectURL(object_url); };
  }, [photo_path, revision]);

  const export_photo = async () => {
    if (export_lock_ref.current || !current_photo) return;
    export_lock_ref.current = true;
    set_export_pending(true);
    set_export_feedback(null);
    let feedback;
    try {
      const result = await export_workout_photo(current_photo.photo_blob, photo_export_filename(photo_path, workout_date));
      feedback = { message: result === 'downloaded'
        ? '사진 다운로드를 요청했습니다.'
        : '내보내기 창을 닫았습니다. 저장 여부는 선택한 앱에서 확인해 주세요.' };
    } catch (error) {
      if (error.name === 'AbortError' || /\bcancel(?:led|ed)?\b/i.test(error.message || '')) {
        feedback = { message: '사진 내보내기를 취소했습니다.' };
      } else {
        console.error('[PHOTO_EXPORT_ERROR]', error.name, error.message);
        feedback = { message: '사진을 내보내지 못했습니다. 다시 시도해 주세요.', is_error: true };
      }
    } finally {
      export_lock_ref.current = false;
      set_export_pending(false);
      if (current_photo_path_ref.current === photo_path) set_export_feedback(feedback);
    }
  };

  if (error_message) return <div className="errorText" role="alert">{localize_message(error_message)} {revision < 2 && <button className="textButton" type="button" onClick={() => set_revision((value) => value + 1)}>{t("사진 다시 불러오기")}</button>}</div>;
  return current_photo ? <div className="savedPhotoContainer">
    <img className="savedPhoto" src={current_photo.photo_url} alt={alt || t('저장된 운동 인증 사진')} />
    <button className="wideButton secondary savedPhotoExport" type="button" disabled={export_pending} aria-busy={export_pending} onClick={export_photo}>
      <MaterialIcon>{export_pending ? 'progress_activity' : 'ios_share'}</MaterialIcon>{t(export_pending ? '내보내는 중…' : '사진 내보내기')}
    </button>
    {export_feedback && <p className={export_feedback.is_error ? 'errorText' : 'infoText'} role={export_feedback.is_error ? 'alert' : 'status'}>{t(export_feedback.message)}</p>}
  </div> : <p className="infoText" role="status">{t("사진 불러오는 중…")}</p>;
}
