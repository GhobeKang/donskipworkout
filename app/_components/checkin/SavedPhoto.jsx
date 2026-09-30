import { useLanguage } from '../../_hooks/useLanguage';
import { useEffect, useState } from 'react';
import { api_request } from '../../_lib/api';

export default function SavedPhoto({ photo_path, alt }) {
  const { t, localize_message } = useLanguage();
  const [photo_url, set_photo_url] = useState('');
  const [error_message, set_error_message] = useState('');
  const [revision, set_revision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let object_url = '';
    set_photo_url('');
    set_error_message('');
    api_request(photo_path, { signal: controller.signal, response_type: 'blob' }).then((photo_blob) => {
      if (controller.signal.aborted) return;
      object_url = URL.createObjectURL(photo_blob);
      set_photo_url(object_url);
    }).catch((error) => { if (!controller.signal.aborted) set_error_message(error.message); });
    return () => { controller.abort(); if (object_url) URL.revokeObjectURL(object_url); };
  }, [photo_path, revision]);
  if (error_message) return <div className="errorText" role="alert">{localize_message(error_message)} <button className="textButton" onClick={() => set_revision((value) => value + 1)}>{t("사진 다시 불러오기")}</button></div>;
  return photo_url ? <img className="savedPhoto" src={photo_url} alt={alt || t('저장된 운동 인증 사진')} /> : <p className="infoText" role="status">{t("사진 불러오는 중…")}</p>;
}
