import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { translate } from './i18n';
import { report_area_label } from './exerciseClassification';
import { comparison_text, personal_report_copy, report_status } from './personalReport';
import { performance_text } from './reportEvidence';
import { muscle_activity_value } from './anatomy/muscleActivity';

export function weekly_share_copy(report, language) {
  const t = (message, values = []) => translate(message, values, language);
  const copy = personal_report_copy(report, language);
  const period = `${report.period_start} — ${report.period_end}`;
  const status = t(report_status(report));
  const recent = copy.insights.recent.comparisons;
  const highlight = recent[0] || copy.insights.journey.comparisons[0];
  const highlight_title = copy.highlight?.exercise_name || (highlight ? report_area_label(highlight.target_area, language) : copy.metrics[0]?.label);
  const highlight_detail = copy.highlight ? performance_text(copy.highlight, language)
    : highlight ? comparison_text(highlight, language) : copy.metrics[0]?.value;
  const summary_metrics = copy.metrics.filter((metric) => ['performance', 'workout_time', 'muscle_activity', 'consistency', 'recovery'].includes(metric.key));
  const muscle_targets = copy.insights.muscle_activity?.current.targets || [];
  summary_metrics.push(...muscle_targets.slice(0, 6).map((target) => ({
    label: report_area_label([target.target_area, target.target_subarea].filter(Boolean).join(' · '), language),
    value: muscle_activity_value(target, t),
  })));
  if (muscle_targets.length > 6) summary_metrics.push({ label: t('추가 부위 분류'), value: t('{0}개 분류는 상세 리포트에서 확인하세요.', [muscle_targets.length - 6]) });
  const caption = ["DON'T SKIP", t('나의 변화 리포트'), period, status,
    t('기준일: {0}', [report.as_of_date]), copy.title,
    ...summary_metrics.map((metric) => `${metric.label}: ${metric.value}`),
    highlight_title, highlight_detail,
    t('직접 기록한 운동 기준 · 다른 사용자와의 순위가 아니에요.')].filter(Boolean).join('\n');
  return { ...copy, period, status, highlight_title, highlight_detail, summary_metrics, caption };
}

export function create_weekly_share_image(report, language) {
  const t = (message, values = []) => translate(message, values, language);
  const copy = weekly_share_copy(report, language);
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error(t('공유 이미지를 만들지 못했습니다.')));
  const colors = { background: '#121416', panel: '#1d2023', text: '#f5f5f2', muted: '#b0b6bb', accent: '#ffa570', bar: '#ff894a' };
  const wrap_text = (text, size, max_width = 920) => {
    context.font = `600 ${size}px "Noto Sans KR", system-ui, sans-serif`;
    const lines = [];
    let current_line = '';
    for (const character of String(text)) {
      if (current_line && context.measureText(current_line + character).width > max_width) { lines.push(current_line); current_line = character; }
      else current_line += character;
    }
    if (current_line) lines.push(current_line);
    return lines;
  };
  const title_lines = wrap_text(copy.title, 40);
  const graphic_y = 300 + title_lines.length * 52 + 22;
  const metric_y = graphic_y + (copy.highlight ? 340 : copy.highlight_title ? 200 : 0);
  const metric_rows = copy.summary_metrics.map((metric) => ({ ...metric, lines: wrap_text(metric.value, 28, 850) }));
  const footer_y = metric_y + metric_rows.reduce((height, metric) => height + 82 + metric.lines.length * 36, 0) + 24;
  const footer_lines = wrap_text(t('직접 기록한 운동 기준 · 다른 사용자와의 순위가 아니에요.'), 24);
  canvas.height = footer_y + footer_lines.length * 32 + 45;
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
  draw_text("DON'T SKIP", 76, 80, 32, colors.accent, 800);
  draw_text(t('나의 변화 리포트'), 76, 145, 48, colors.text, 800);
  draw_text(copy.period, 76, 201, 28, colors.muted, 500);
  draw_text(`${copy.status} · ${t('기준일: {0}', [report.as_of_date])}`, 76, 247, 24, colors.muted);
  title_lines.forEach((line, index) => draw_text(line, 76, 300 + index * 52, 40, colors.accent));
  if (copy.highlight) {
    const comparison = copy.highlight;
    const number_formatter = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: 2 });
    const record_value = (value) => t(comparison.dimension === 'reps' ? '{0}회' : '{0}kg', [number_formatter.format(value)]);
    const bar_maximum = Math.max(comparison.previous_value, comparison.current_value);
    draw_panel(76, graphic_y, 928, 310);
    draw_text(comparison.exercise_name, 104, graphic_y + 52, 34, colors.text, 600, 870);
    draw_text(t(comparison.dimension === 'reps' ? '동일 {0}kg 중량' : '동일 {0}회 반복', [number_formatter.format(comparison.condition_value)]), 104, graphic_y + 96, 26, colors.muted);
    [[t('이전'), comparison.previous_value, colors.muted], [t('이번'), comparison.current_value, colors.bar]].forEach(([label, value, bar_color], index) => {
      const bar_y = graphic_y + 135 + index * 58;
      draw_text(label, 104, bar_y + 23, 25, colors.muted);
      context.fillStyle = colors.background;
      context.fillRect(205, bar_y, 590, 27);
      context.fillStyle = bar_color;
      context.fillRect(205, bar_y, bar_maximum > 0 ? value / bar_maximum * 590 : 0, 27);
      draw_text(record_value(value), 822, bar_y + 23, 26, colors.text, 600, 155);
    });
    draw_text(t(comparison.confirmation_days >= 2 ? '서로 다른 운동일 {0}일에서 확인' : '한 운동일에서 관찰 · 반복 확인 전', [comparison.confirmation_days]), 104, graphic_y + 280, 24, colors.muted, 500, 870);
  } else if (copy.highlight_title) {
    draw_panel(76, graphic_y, 928, 170);
    draw_text(copy.highlight_title, 104, graphic_y + 54, 30, colors.text, 600, 870);
    draw_text(copy.highlight_detail, 104, graphic_y + 110, 26, colors.accent, 500, 870);
  }
  let row_y = metric_y;
  metric_rows.forEach((metric) => {
    draw_text(metric.label, 76, row_y + 35, 26, colors.muted, 500);
    metric.lines.forEach((line, index) => draw_text(line, 76, row_y + 76 + index * 36, 28));
    row_y += 82 + metric.lines.length * 36;
    context.fillStyle = colors.panel;
    context.fillRect(76, row_y - 8, 928, 2);
  });
  footer_lines.forEach((line, index) => draw_text(line, 76, footer_y + index * 32, 24, colors.muted, 500));
  return new Promise((resolve, reject) => {
    const timeout_id = setTimeout(() => reject(new Error(t('공유 이미지 준비 시간이 초과되었습니다.'))), 8000);
    canvas.toBlob((blob) => {
      clearTimeout(timeout_id);
      try {
        if (!blob) throw new Error(t('공유 이미지를 만들지 못했습니다.'));
        resolve({ blob, base64: canvas.toDataURL('image/png').split(',')[1], caption: copy.caption, width: canvas.width, height: canvas.height });
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
