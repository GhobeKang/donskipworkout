import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { translate as t } from './i18n';

export function photo_export_filename(photo_path, workout_date) {
  const date_label = /^\d{4}-\d{2}-\d{2}$/.test(workout_date || '') ? workout_date : '';
  const session_id = /^\/sessions\/([a-f0-9-]{36})\/photo$/i.exec(photo_path || '')?.[1];
  return `dont-skip-workout-${date_label || session_id || 'photo'}.jpg`;
}

function prepare_native_photo(photo_blob, file_name) {
  const file_reader = new FileReader();
  let timeout_id;
  const preparation = new Promise((resolve, reject) => {
    timeout_id = setTimeout(() => {
      reject(new Error(t('사진 내보내기 준비 시간이 초과되었습니다. 다시 시도해 주세요.')));
      file_reader.abort();
    }, 12000);
    file_reader.onerror = () => reject(new Error(t('사진 파일을 읽을 수 없습니다.')));
    file_reader.onabort = () => reject(new DOMException('Photo export aborted', 'AbortError'));
    file_reader.onload = () => {
      Filesystem.writeFile({
        path: file_name,
        data: file_reader.result.split(',')[1],
        directory: Directory.Cache,
      }).then(resolve, reject);
    };
    file_reader.readAsDataURL(photo_blob);
  });
  return preparation.finally(() => clearTimeout(timeout_id));
}

export async function export_workout_photo(photo_blob, file_name) {
  if (!photo_blob?.size || photo_blob.type !== 'image/jpeg') {
    throw new Error(t('내보낼 사진을 다시 불러와 주세요.'));
  }
  if (Capacitor.isNativePlatform()) {
    const saved_file = await prepare_native_photo(photo_blob, file_name);
    // Repeated exports reuse the same photo's cache file. Recipients may read it
    // after the share sheet closes, so leave its lifetime to the system cache.
    await Share.share({ title: t('운동 인증 사진'), files: [saved_file.uri], dialogTitle: t('사진 내보내기') });
    return 'shared';
  }
  const download_url = URL.createObjectURL(photo_blob);
  const download_link = document.createElement('a');
  try {
    download_link.href = download_url;
    download_link.download = file_name;
    document.body.appendChild(download_link);
    download_link.click();
  } finally {
    download_link.remove();
    setTimeout(() => URL.revokeObjectURL(download_url), 1000);
  }
  return 'downloaded';
}
