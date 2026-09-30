import { useEffect, useRef, useState } from 'react';
import useApiResource from '../../_hooks/useApiResource';
import { useLanguage } from '../../_hooks/useLanguage';
import { create_weekly_share_image, download_weekly_image, is_native_sharing, share_weekly_image, weekly_share_copy } from '../../_lib/weeklyShare';
import MaterialIcon from '../ui/MaterialIcon';
import RequestState from '../ui/RequestState';
import PersonalReport from './PersonalReport';
import { create_report_document } from '../../_lib/personalReport';

export default function WeeklyShare({ revision, on_unauthorized }) {
  const { t, language } = useLanguage();
  const [week_offset, set_week_offset] = useState(0);
  const [retry_count, set_retry_count] = useState(0);
  const [prepared_image, set_prepared_image] = useState(null);
  const [image_error, set_image_error] = useState('');
  const [pending, set_pending] = useState(false);
  const [feedback, set_feedback] = useState('');
  const sharing_lock = useRef(false);
  const report_resource = useApiResource(`/sharing/weekly?week_offset=${week_offset}`, `${revision}:${retry_count}`, on_unauthorized);
  const report = report_resource.data;
  const ready_image = prepared_image?.report === report && prepared_image?.language === language
    && !report_resource.loading && !report_resource.error ? prepared_image : null;

  useEffect(() => {
    let cancelled = false;
    let preview_url;
    set_prepared_image(null);
    set_image_error('');
    set_feedback('');
    if (!report?.insights || report_resource.loading || report_resource.error) return;
    create_weekly_share_image(report, language).then((image_data) => {
      if (cancelled) return;
      preview_url = URL.createObjectURL(image_data.blob);
      set_prepared_image({ ...image_data, preview_url, report, language });
    }).catch((error) => {
      if (!cancelled) set_image_error(error.message);
      console.error('[WEEKLY_SHARE_IMAGE]', error);
    });
    return () => {
      cancelled = true;
      if (preview_url) URL.revokeObjectURL(preview_url);
    };
  }, [report, language, report_resource.loading, report_resource.error, retry_count]);

  const share_image = async (format = 'image') => {
    if (sharing_lock.current || report_resource.loading || report_resource.error || !report?.insights || (format === 'image' && !ready_image)) return;
    sharing_lock.current = true;
    set_pending(true);
    set_feedback('');
    try {
      const prepared_file = format === 'report' ? create_report_document(report, language) : ready_image;
      const result = await share_weekly_image(prepared_file, format === 'report' ? 'dont-skip-report.txt' : 'dont-skip-weekly.png');
      set_feedback(result === 'downloaded'
        ? t('공유를 지원하지 않아 파일 다운로드를 요청했습니다.')
        : t('공유 창을 닫았습니다. 게시 여부는 선택한 앱에서 확인해 주세요.'));
    } catch (error) {
      if (error.name === 'AbortError' || /cancel/i.test(error.message || '')) set_feedback(t('공유를 취소했습니다.'));
      else {
        console.error('[WEEKLY_SHARE]', error);
        set_feedback(t('공유하지 못했습니다. 다시 시도해 주세요.'));
      }
    } finally {
      sharing_lock.current = false;
      set_pending(false);
    }
  };

  const copy = report?.insights ? weekly_share_copy(report, language) : null;
  return <section className="weeklyShare" aria-labelledby="weekly-share-title">
    <div className="sectionHeading"><h2 id="weekly-share-title">{t('남 말고, 어제의 나와.')}</h2></div>
    <p className="infoText">{t('기록 변화·복귀·도전·꾸준함·취향을 함께 살펴봐요.')}</p>
    <div className="tabs" aria-label={t('공유 기간')}>
      {[[0, '이번 주'], [1, '지난주']].map(([offset, label]) => <button type="button" key={offset} disabled={pending} aria-pressed={week_offset === offset} className={week_offset === offset ? 'isActive' : ''} onClick={() => { set_week_offset(offset); set_retry_count(0); }}>{t(label)}</button>)}
    </div>
    {report && !report.insights && !report_resource.loading && <p className="errorText" role="alert">{t('상세 리포트에는 서버 업데이트가 필요합니다.')}</p>}
    <RequestState loading={report_resource.loading} error={report_resource.error || image_error} on_retry={retry_count < 2 ? () => set_retry_count((count) => count + 1) : undefined} />
    {report?.insights && !report_resource.loading && !report_resource.error && <>
      <PersonalReport report={report} />
      {report.is_baseline_week && <p className="infoText">{t('중간에 시작한 첫 주는 준비 기간입니다. 다음 주부터 미리 정한 약속으로 평가해요.')}</p>}
      {report.is_current_week && report.next_target_count !== null && <p className="infoText">{t('다음 주 약속: {0}회 · 설정의 운동 요일 수로 정해져요.', [report.next_target_count])}</p>}
      {ready_image ? <details className="shareImagePreview"><summary>{t('요약 이미지 미리보기')}</summary><img className="weeklySharePreview" src={ready_image.preview_url} alt={copy.caption} width={1080} height={1350} /></details> : !image_error && <p role="status" className="infoText">{t('공유 이미지 준비 중…')}</p>}
      <div className="shareActions">
        <button type="button" className="wideButton primary" disabled={!ready_image || pending} onClick={() => share_image('image')}><MaterialIcon>ios_share</MaterialIcon>{t(pending ? '공유 창 열림…' : '이미지 공유하기')}</button>
        <button type="button" className="wideButton secondary" disabled={pending} onClick={() => share_image('report')}>{t('전체 리포트 파일 공유')}</button>
        {!is_native_sharing() && <button type="button" className="wideButton secondary" disabled={!ready_image || pending} onClick={() => {
          download_weekly_image(ready_image, `dont-skip-${report.week_start}.png`);
          set_feedback(t('이미지 다운로드를 요청했습니다.'));
        }}>{t('이미지 저장')}</button>}
      </div>
      <details className="shareRules"><summary>{t('어떻게 평가하나요?')}</summary>
        <p>{t('월요일부터 일요일까지, 완료한 운동을 하루 1회 계산해요. 요일을 옮겨도 주간 횟수를 채우면 약속을 지킨 거예요.')}</p>
        <p>{t('달성률은 최대 100%. 목표를 넘긴 횟수는 별도로 보여주며, 추가 운동이 없어도 감점하지 않아요.')}</p>
        <p>{t('운동 요일과 알림은 저장 즉시 바뀌지만, 공유 평가의 목표 횟수는 다음 주부터 바뀌어요. 지난 약속은 바뀌지 않아요.')}</p>
        <p>{t('기록 향상은 지난주와 같은 종목·중량의 최고 반복 수를 비교해요. 몸의 변화나 전체 운동 능력을 판정하는 점수는 아니에요.')}</p>
        <p>{t('공유 이미지에는 이름, 사진, 메모를 넣지 않아요. 이미지 공유를 누른 뒤 올릴 앱을 선택하세요.')}</p>
      </details>
    </>}
    <p className="shareFeedback" role="status" aria-live="polite">{feedback}</p>
  </section>;
}
