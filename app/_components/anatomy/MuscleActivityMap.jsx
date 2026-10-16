'use client';

import InfoTooltip from '../ui/InfoTooltip';
import { useMemo, useState } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import { atlas_muscles, muscle_label, muscles_by_id } from '../../_lib/anatomy/muscleAtlas';
import { activity_bands, activity_color, activity_for_muscles } from '../../_lib/anatomy/muscleActivity';
import { report_area_label } from '../../_lib/exerciseClassification';
import MaterialIcon from '../ui/MaterialIcon';
import MuscleMap from './MuscleMap';
import report_styles from '../reports/MuscleActivityReport.module.css';

export default function MuscleActivityMap({ summary }) {
  const { t, language } = useLanguage();
  const [view, set_view] = useState('front');
  const [zoom_level, set_zoom_level] = useState(1);
  const [active_muscle_id, set_active_muscle_id] = useState(null);
  const activity_by_muscle = useMemo(() => activity_for_muscles(summary, atlas_muscles), [summary]);
  const highlighted_muscles = useMemo(() => Object.fromEntries(Object.entries(activity_by_muscle)
    .map(([muscle_id, activity]) => [muscle_id, activity_color(activity.activity_score)])), [activity_by_muscle]);
  const active_muscle = muscles_by_id[active_muscle_id];
  const active_activity = activity_by_muscle[active_muscle_id];

  return <div className={report_styles.mapBody}>
    <div className={report_styles.mapToolbar}>
      <div className={report_styles.viewSwitch} role="group" aria-label={t('신체 방향')}>
        {['front', 'back'].map((map_view) => <button type="button" key={map_view} aria-pressed={view === map_view} onClick={() => { set_view(map_view); set_zoom_level(1); set_active_muscle_id(null); }}>{t(map_view === 'front' ? '앞면' : '뒷면')}</button>)}
      </div>
      <InfoTooltip label={t('근육 활동')}><span className="infoTooltipParagraph">{t('점선은 큰 부위·근육군 분류입니다. 좌우 정보가 없어 양쪽에 함께 표시합니다.')}</span><span className="infoTooltipParagraph">{t('부위를 눌러 해당 분류의 종목 수와 세트 수를 확인하세요.')}</span></InfoTooltip>
      <div className={report_styles.zoomControls} role="group" aria-label={t('지도 확대·축소')}>
        <button type="button" disabled={zoom_level === 1} aria-label={t('지도 축소')} onClick={() => set_zoom_level((current_zoom) => Math.max(1, current_zoom - 0.5))}><MaterialIcon>remove</MaterialIcon></button>
        <output aria-label={t('확대 배율')}>{Math.round(zoom_level * 100)}%</output>
        <button type="button" disabled={zoom_level === 2.5} aria-label={t('지도 확대')} onClick={() => set_zoom_level((current_zoom) => Math.min(2.5, current_zoom + 0.5))}><MaterialIcon>add</MaterialIcon></button>
      </div>
    </div>
    <div className={report_styles.legend} aria-label={t('활동지수 색상 범례')}>
      <span><i className={report_styles.noRecordSwatch} aria-hidden="true" />{t('기록 없음')}</span>
      {activity_bands.map((band) => <span key={band.minimum}><i style={{ backgroundColor: band.color }} aria-hidden="true" />{band.label}</span>)}
    </div>
    <div className={report_styles.mapViewport} tabIndex={0} aria-label={t('확대 시 스크롤하여 근육 지도를 이동하세요')}>
      <MuscleMap view={view} highlighted_muscles={highlighted_muscles} activity_by_muscle={activity_by_muscle} active_muscle_id={active_muscle_id} language={language} on_inspect={set_active_muscle_id} zoom_level={zoom_level} />
    </div>
    {active_muscle && <div className={report_styles.inspection} role="status" aria-live="polite">
      <>
        <strong>{muscle_label(active_muscle, language)}{active_activity?.is_coarse && <InfoTooltip label={muscle_label(active_muscle, language)}>{t('세부 근육별 자극량 분배는 확인할 수 없습니다.')}</InfoTooltip>}</strong>
        {active_activity ? <>
          <p>{t('해당 분류의 기록: {0}종목 · {1}세트 · 활동지수 {2}', [active_activity.exercise_count, active_activity.set_count, active_activity.activity_score])}</p>
          <small>{active_activity.targets.map((target) => report_area_label([target.target_area, target.target_subarea].filter(Boolean).join(' · '), language)).join(' / ')}</small>
        </> : <p>{t('이 부위에 연결된 타겟 분류의 기록이 없습니다.')}</p>}
      </>
    </div>}
    <p className={report_styles.credits}>Artwork: <a href="https://www.figma.com/community/file/1320468164820924031" target="_blank" rel="noreferrer">Ryan Graves</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · <a href="/assets/anatomy/ATTRIBUTION.txt" target="_blank" rel="noreferrer">{t('출처 및 라이선스')}</a></p>
  </div>;
}
