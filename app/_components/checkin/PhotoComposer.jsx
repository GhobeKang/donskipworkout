import { useLanguage } from '../../_hooks/useLanguage';
import { useEffect, useRef, useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { create_submission_id, crop_photo, draw_photo, load_photo_image } from '../../_lib/photo';
import { api_request } from '../../_lib/api';
import PhotoFrame from './PhotoFrame';
import MaterialIcon from '../ui/MaterialIcon';

export default function PhotoComposer({ catalog, disabled, on_change }) {
  const { t, localize_message } = useLanguage();
  const [frame_id, set_frame_id] = useState(catalog.frames[0].frame_id);
  const [photo_blob, set_photo_blob] = useState(null);
  const [busy, set_busy] = useState(false);
  const [preview_ready, set_preview_ready] = useState(false);
  const [error_message, set_error_message] = useState('');
  const canvas_ref = useRef(null);
  const operation_id = useRef(0);
  const busy_ref = useRef(false);
  const selected_frame = catalog.frames.find((frame) => frame.frame_id === frame_id);
  useEffect(() => () => {
    operation_id.current += 1;
  }, []);

  useEffect(() => {
    on_change(null);
    set_preview_ready(false);
    if (!photo_blob) return;
    let cancelled = false;
    let frame_object_url = '';
    const controller = new AbortController();
    const photo_url = URL.createObjectURL(photo_blob);
    load_photo_image(photo_url).then((photo_image) => {
      if (cancelled || !canvas_ref.current) return;
      const frame_image_promise = selected_frame.image_url
        ? api_request(selected_frame.image_url, { signal: controller.signal, response_type: 'blob' }).then((frame_blob) => {
          frame_object_url = URL.createObjectURL(frame_blob);
          return load_photo_image(frame_object_url);
        }) : Promise.resolve(null);
      return frame_image_promise.then((frame_image) => {
        if (cancelled || !canvas_ref.current) return;
        draw_photo(canvas_ref.current, photo_image, catalog, frame_id, frame_image);
        set_preview_ready(true);
        on_change({ photo_blob, frame_id, submission_id: create_submission_id() });
      });
    }).catch((error) => { if (!cancelled) set_error_message(error.message); });
    return () => {
      cancelled = true;
      controller.abort();
      URL.revokeObjectURL(photo_url);
      if (frame_object_url) URL.revokeObjectURL(frame_object_url);
    };
  }, [photo_blob, frame_id, catalog, on_change]);

  const open_camera = async () => {
    if (busy_ref.current || disabled) return;
    busy_ref.current = true;
    set_busy(true);
    set_error_message('');
    const current_operation = ++operation_id.current;
    let timeout_id;
    try {
      const camera_result = await Promise.race([
        Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Uri, quality: 100,
          correctOrientation: true, saveToGallery: false, allowEditing: false }),
        new Promise((_, reject) => { timeout_id = setTimeout(() => reject(new Error(t("촬영 대기 시간이 지났습니다. 다시 카메라를 열어 주세요."))), 120000); }),
      ]);
      if (current_operation !== operation_id.current) return;
      const source_image = await load_photo_image(camera_result.webPath);
      const captured_blob = await crop_photo(source_image, catalog);
      if (current_operation === operation_id.current) set_photo_blob(captured_blob);
    } catch (error) {
      if (current_operation === operation_id.current) {
        operation_id.current += 1;
        set_error_message(error.message || t("촬영을 취소했거나 카메라를 열 수 없습니다."));
      }
    } finally {
      clearTimeout(timeout_id);
      busy_ref.current = false;
      set_busy(false);
    }
  };

  return <div className="photoComposer" aria-busy={busy}>
    <div className="photoStage">
      {photo_blob ? <canvas ref={canvas_ref} className="photoCanvas" role="img" aria-label={t("{0} 프레임과 고정 웜 톤을 적용한 운동 사진", [selected_frame.label])} />
        : <div className="photoPlaceholder"><MaterialIcon>photo_camera</MaterialIcon><strong>{t("먼저 운동 사진을 촬영하세요")}</strong><p>{t("기기 카메라로 촬영한 뒤")}<br />{t("프레임을 골라 미리볼 수 있어요.")}</p></div>}
      {busy && <span className="photoBusy" role="status">{t("카메라 준비 중…")}</span>}
    </div>
    <p className="photoHint">{photo_blob ? t("프레임을 선택하면 미리보기에 바로 반영됩니다") : t("기기 카메라로 촬영합니다 · 촬영 후 세로 9:16으로 맞춥니다")}</p>
    <div className="photoActions">
      <button type="button" className="wideButton primary" disabled={disabled || busy} onClick={open_camera}>{photo_blob ? t("다시 촬영") : t("카메라 열기")}</button>
    </div>
    <fieldset disabled={disabled || busy || !photo_blob} className="photoFramePicker">
      <legend>{photo_blob ? t("프레임 선택") : t("사진 촬영 후 프레임을 선택하세요")}</legend>
      <div className="photoFrameOptions">{catalog.frames.map((frame) => <button type="button" key={frame.frame_id}
        aria-pressed={frame_id === frame.frame_id} onClick={() => { set_frame_id(frame.frame_id); set_error_message(''); }}
        className={'photoFrameOption' + (frame_id === frame.frame_id ? ' isSelected' : '')}>
        <span className="photoFrameSample"><PhotoFrame catalog={catalog} frame={frame} /></span>
        <span>{frame.label}</span>{frame_id === frame.frame_id && <small>{t("선택됨")}</small>}
      </button>)}</div>
    </fieldset>
    {photo_blob && !preview_ready && !error_message && <p role="status" className="infoText">{t("필터와 프레임을 적용하고 있습니다…")}</p>}
    {error_message && <p className="errorText" role="alert">{localize_message(error_message)}</p>}
  </div>;
}
