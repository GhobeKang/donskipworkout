import { translate as t } from './i18n';
export function create_submission_id() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const random_bytes = crypto.getRandomValues(new Uint8Array(16));
  random_bytes[6] = (random_bytes[6] & 15) | 64;
  random_bytes[8] = (random_bytes[8] & 63) | 128;
  const hex = Array.from(random_bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function pick_photo_character(catalog) {
  const character_ids = catalog.character_ids;
  if (!Array.isArray(character_ids) || character_ids.length === 0) {
    throw new Error(t("사용할 수 있는 캐릭터가 없습니다. 화면을 새로고침해 주세요."));
  }
  const random_value = crypto.getRandomValues(new Uint32Array(1))[0];
  return character_ids[random_value % character_ids.length];
}

export function load_photo_image(photo_url) {
  return new Promise((resolve, reject) => {
    const photo_image = new Image();
    const timeout_id = setTimeout(() => {
      photo_image.onload = null;
      photo_image.onerror = null;
      photo_image.src = '';
      reject(new Error(t("사진을 읽는 시간이 초과되었습니다. 다시 촬영해 주세요.")));
    }, 10000);
    photo_image.onload = () => { clearTimeout(timeout_id); resolve(photo_image); };
    photo_image.onerror = () => { clearTimeout(timeout_id); reject(new Error(t("사진을 읽을 수 없습니다. 다시 촬영해 주세요."))); };
    photo_image.src = photo_url;
  });
}

export function encode_photo(canvas) {
  return new Promise((resolve, reject) => {
    const timeout_id = setTimeout(() => reject(new Error(t("사진 처리 시간이 초과되었습니다."))), 10000);
    canvas.toBlob((photo_blob) => {
      clearTimeout(timeout_id);
      if (photo_blob) resolve(photo_blob);
      else reject(new Error(t("사진 파일을 생성할 수 없습니다.")));
    }, 'image/jpeg', 0.9);
  });
}

export async function crop_photo(source, catalog) {
  const source_width = source.videoWidth || source.naturalWidth;
  const source_height = source.videoHeight || source.naturalHeight;
  if (!source_width || !source_height) throw new Error(t("카메라가 준비되면 다시 촬영해 주세요."));
  const canvas = document.createElement('canvas');
  canvas.width = catalog.width;
  canvas.height = catalog.height;
  const scale = Math.max(canvas.width / source_width, canvas.height / source_height);
  const draw_width = source_width * scale;
  const draw_height = source_height * scale;
  canvas.getContext('2d').drawImage(source, (canvas.width - draw_width) / 2, (canvas.height - draw_height) / 2,
    draw_width, draw_height);
  const photo_blob = await encode_photo(canvas);
  if (photo_blob.size > catalog.max_upload_bytes) throw new Error(t("사진 용량이 너무 큽니다. 다시 촬영해 주세요."));
  return photo_blob;
}

export function draw_photo(canvas, photo_image, catalog, branding_image) {
  canvas.width = catalog.width;
  canvas.height = catalog.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(photo_image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const { contrast, brightness, channel_offsets } = catalog.filter;
  const channel_tables = channel_offsets.map((offset) => Uint8Array.from({ length: 256 }, (_, value) =>
    Math.max(0, Math.min(255, Math.floor(((value - 128) * contrast + 128) * brightness + offset + 0.5)))));
  for (let pixel_index = 0; pixel_index < pixels.data.length; pixel_index += 4) {
    for (let channel_index = 0; channel_index < 3; channel_index += 1) {
      pixels.data[pixel_index + channel_index] = channel_tables[channel_index][pixels.data[pixel_index + channel_index]];
    }
  }
  context.putImageData(pixels, 0, 0);
  context.drawImage(branding_image, 0, 0, canvas.width, canvas.height);
}
