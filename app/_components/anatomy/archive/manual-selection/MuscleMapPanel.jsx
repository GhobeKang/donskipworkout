'use client';

import { lazy, Suspense, useState } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import map_styles from './MuscleMap.module.css';

const MuscleMapExplorer = lazy(() => import('./MuscleMapExplorer'));

export default function MuscleMapPanel() {
  const { t } = useLanguage();
  const [has_opened, set_has_opened] = useState(false);

  return <details className={map_styles.panel} onToggle={(event) => { if (event.currentTarget.open) set_has_opened(true); }}>
    <summary><span><strong>{t('세부 근육 지도')}</strong><small>{t('좌우·세부 근육을 선택하고 색상으로 강조하세요.')}</small></span></summary>
    {has_opened && <Suspense fallback={<p className={map_styles.loading} role="status">{t('근육 지도를 불러오는 중…')}</p>}><MuscleMapExplorer /></Suspense>}
  </details>;
}
