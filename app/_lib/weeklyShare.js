import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { exercise_label, translate } from './i18n';
import { comparison_text, personal_report_copy } from './personalReport';

export function weekly_share_copy(report, language) {
  const t = (message, values = []) => translate(message, values, language);
  const copy = personal_report_copy(report, language);
  const period = `${report.week_start} — ${report.week_end}`;
  const status = t(report.is_current_week ? '진행 중인 리포트' : '완료된 주간 리포트');
  const recent = report.insights.recent.comparisons;
  const highlight = recent.find((item) => item.direction === 'improved')
    || recent.find((item) => item.direction === 'declined')
    || recent[0];
  const highlight_title = highlight ? exercise_label(highlight, language) : t('비교 기록을 쌓는 중');
  const highlight_detail = highlight ? comparison_text(highlight, language) : t('같은 조건의 기록이 있어야 변화를 비교할 수 있어요.');
  const caption = ["DON'T SKIP", t('나의 변화 리포트'), period, status,
    t('기준일: {0}', [report.as_of_date]), copy.title, copy.coverage, copy.commitment,
    ...copy.metrics.map((metric) => `${metric.label}: ${metric.value}`),
    highlight_title, highlight_detail, ...copy.evidence,
    t('직접 기록한 운동 기준 · 다른 사용자와의 순위가 아니에요.')].join('\n');
  return { ...copy, period, status, highlight_title, highlight_detail, caption };
}

export function create_weekly_share_image(report, language) {
  const t = (message, values = []) => translate(message, values, language);
  const copy = weekly_share_copy(report, language);
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error(t('공유 이미지를 만들지 못했습니다.')));
  const colors = { background: '#141a18', panel: '#222b26', text: '#f5f5ed', muted: '#b8c3ba', accent: '#d0ed95' };
  const draw_text = (text, x, y, size, color = colors.text, weight = 600, max_width = 920) => {
    context.fillStyle = color;
    context.font = `${weight} ${size}px "Noto Sans KR", system-ui, sans-serif`;
    let display_text = String(text);
    if (context.measureText(display_text).width > max_width) {
      while (display_text.length && context.measureText(`${display_text}…`).width > max_width) display_text = display_text.slice(0, -1);
      display_text += '…';
    }
    context.fillText(display_text, x, y);
  };
  const draw_panel = (x, y, width, height) => {
    context.fillStyle = colors.panel;
    context.beginPath();
    context.roundRect(x, y, width, height, 26);
    context.fill();
  };
  context.fillStyle = colors.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  draw_text("DON'T SKIP", 76, 95, 34, colors.accent, 800);
  draw_text(t('나의 변화 리포트'), 76, 161, 52, colors.text, 800);
  draw_text(copy.period, 76, 217, 30, colors.muted, 500);
  draw_text(`${copy.status} · ${t('기준일: {0}', [report.as_of_date])}`, 76, 265, 26, colors.muted);
  // Keep the conclusion readable without horizontal text compression.
  context.font = '700 42px "Noto Sans KR", system-ui, sans-serif';
  const title_words = copy.title.split(' ');
  let title_line = '';
  let title_y = 338;
  for (const word of title_words) {
    if (title_line && context.measureText(`${title_line} ${word}`).width > 920) {
      draw_text(title_line, 76, title_y, 42, colors.accent, 700);
      title_y += 54;
      title_line = word;
    } else title_line = title_line ? `${title_line} ${word}` : word;
  }
  draw_text(title_line, 76, title_y, 42, colors.accent, 700);
  copy.metrics.forEach((metric, index) => {
    const panel_x = index % 2 ? 552 : 76;
    const panel_y = 434 + Math.floor(index / 2) * 175;
    draw_panel(panel_x, panel_y, 452, 149);
    draw_text(metric.label, panel_x + 28, panel_y + 50, 29, colors.muted, 500, 396);
    draw_text(metric.value, panel_x + 28, panel_y + 105, language === 'en' ? 26 : 31, colors.text, 750, 396);
  });
  draw_panel(76, 982, 928, 180);
  draw_text(t('변화의 근거'), 104, 1028, 28, colors.muted);
  draw_text(copy.highlight_title, 104, 1080, 38, colors.text, 750, 870);
  draw_text(copy.highlight_detail, 104, 1131, 30, colors.accent, 600, 870);
  draw_text(copy.commitment, 76, 1208, 24, colors.muted, 500);
  draw_text(copy.coverage, 76, 1246, 24, colors.muted, 500);
  draw_text(t('직접 기록한 운동 기준 · 다른 사용자와의 순위가 아니에요.'), 76, 1284, 24, colors.muted, 500);
  return new Promise((resolve, reject) => {
    const timeout_id = setTimeout(() => reject(new Error(t('공유 이미지 준비 시간이 초과되었습니다.'))), 8000);
    canvas.toBlob((blob) => {
      clearTimeout(timeout_id);
      try {
        if (!blob) throw new Error(t('공유 이미지를 만들지 못했습니다.'));
        resolve({ blob, base64: canvas.toDataURL('image/png').split(',')[1], caption: copy.caption });
      } catch (error) { reject(error); }
    }, 'image/png');
  });
}

export function is_native_sharing() {
  return Capacitor.isNativePlatform();
}

export async function share_weekly_image(prepared_image, filename) {
  if (is_native_sharing()) {
    const saved_file = await Filesystem.writeFile({ path: filename, data: prepared_image.base64, directory: Directory.Cache });
    // Keep one bounded cache file: recipients may read it after the sheet closes.
    await Share.share({ title: "DON'T SKIP", files: [saved_file.uri], dialogTitle: "DON'T SKIP" });
    return 'shared';
  }
  const image_file = new File([prepared_image.blob], filename, { type: prepared_image.blob.type });
  if (navigator.canShare?.({ files: [image_file] }) && navigator.share) {
    await navigator.share({ title: "DON'T SKIP", files: [image_file] });
    return 'shared';
  }
  download_weekly_image(prepared_image, filename);
  return 'downloaded';
}

export function download_weekly_image(prepared_image, filename) {
  const image_url = URL.createObjectURL(prepared_image.blob);
  const download_link = document.createElement('a');
  download_link.href = image_url;
  download_link.download = filename;
  document.body.appendChild(download_link);
  download_link.click();
  download_link.remove();
  setTimeout(() => URL.revokeObjectURL(image_url), 1000);
}
