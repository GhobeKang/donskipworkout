import { useLanguage } from '../../_hooks/useLanguage';
import { useEffect, useRef, useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { create_submission_id, crop_photo, draw_photo, load_photo_image, pick_photo_character } from '../../_lib/photo';
import { api_request } from '../../_lib/api';
import MaterialIcon from '../ui/MaterialIcon';

export default function PhotoComposer({ catalog, workout_date, disabled, on_change }) {
  const { t, localize_message, language } = useLanguage();
  const [captured_photo, set_captured_photo] = useState(null);
  const [preview_revision, set_preview_revision] = useState(0);
  const [busy, set_busy] = useState(false);
  const [preview_ready, set_preview_ready] = useState(false);
  const [error_message, set_error_message] = useState('');
  const canvas_ref = useRef(null);
  const operation_id = useRef(0);
  const busy_ref = useRef(false);
  useEffect(() => () => {
    operation_id.current += 1;
  }, []);

  useEffect(() => {
    on_change(null);
    set_preview_ready(false);
    if (!captured_photo || busy) return;
    let cancelled = false;
    const controller = new AbortController();
    const photo_url = URL.createObjectURL(captured_photo.photo_blob);
    const branding_query = new URLSearchParams({
      captured_at: captured_photo.captured_at,
      capture_timezone: captured_photo.capture_timezone,
      workout_date,
      branding_language: language,
      character_id: captured_photo.character_id,
    });
    const branding_image_promise = api_request(`/photo-branding?${branding_query}`, {
      signal: controller.signal,
    }).then(async (branding_data) => {
      if (cancelled) return null;
      return { branding_image: await load_photo_image(branding_data.image_data_url),
        workout_summary_hash: branding_data.workout_summary_hash };
    });
    Promise.all([load_photo_image(photo_url), branding_image_promise])
      .then(([photo_image, branding_preview]) => {
        if (cancelled || !canvas_ref.current) return;
        draw_photo(canvas_ref.current, photo_image, catalog, branding_preview.branding_image);
        set_preview_ready(true);
        on_change({ ...captured_photo, workout_summary_hash: branding_preview.workout_summary_hash,
          branding_language: language, submission_id: create_submission_id() });
      }).catch((error) => { if (!cancelled) set_error_message(error.message); });
    return () => {
      cancelled = true;
      controller.abort();
      URL.revokeObjectURL(photo_url);
    };
  }, [captured_photo, busy, catalog, on_change, workout_date, language, preview_revision]);

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
      const captured_at = new Date().toISOString();
      const capture_timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const source_image = await load_photo_image(camera_result.webPath);
      const captured_blob = await crop_photo(source_image, catalog);
      if (current_operation === operation_id.current) {
        set_captured_photo({ photo_blob: captured_blob, captured_at, capture_timezone,
          character_id: pick_photo_character(catalog) });
      }
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
      {captured_photo ? <canvas ref={canvas_ref} className="photoCanvas" role="img" aria-label={t("로고, 이름, 현지 시각, 전체 운동 목록, 총 중량, 주 운동 부위와 캐릭터를 적용한 운동 사진")} />
        : <div className="photoPlaceholder"><MaterialIcon>photo_camera</MaterialIcon><strong>{t("먼저 운동 사진을 촬영하세요")}</strong><p>{t("상단 로고와 오늘의 운동 목록,")}<br />{t("이름, 현지 시각과 캐릭터가 자동으로 들어갑니다.")}</p></div>}
      {busy && <span className="photoBusy" role="status">{t("카메라 준비 중…")}</span>}
    </div>
    <p className="photoHint">{captured_photo ? t("촬영 시각은 촬영 당시 기기의 현지 시각으로 표시됩니다") : t("기기 카메라로 촬영합니다 · 촬영 후 세로 9:16으로 맞춥니다")}</p>
    <div className="photoActions">
      <button type="button" className="wideButton primary" disabled={disabled || busy} onClick={open_camera}>{captured_photo ? t("다시 촬영") : t("카메라 열기")}</button>
      {captured_photo && <button type="button" className="quietButton" disabled={disabled || busy}
        onClick={() => { set_error_message(''); set_preview_revision((value) => value + 1); }}>{t("운동 목록 새로고침")}</button>}
    </div>
    {captured_photo && !busy && !preview_ready && !error_message && <p role="status" className="infoText">{t("사진에 로고와 촬영 정보를 적용하고 있습니다…")}</p>}
    {error_message && <p className="errorText" role="alert">{localize_message(error_message)}</p>}
  </div>;
}
