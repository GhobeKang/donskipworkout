import { useLanguage } from '../../_hooks/useLanguage';
import PerformanceTable from './PerformanceTable';
import InfoTooltip from '../ui/InfoTooltip';

export default function PerformanceEvidence({ performance, show_info_tooltips = false }) {
  const { t } = useLanguage();
  if (!performance) return null;
  return <>
    <p className="reportCoverage">{t('비교 가능 {0}/{1}종목 · 비교 자료 부족 {2}종목', [performance.comparable_count, performance.exercise_count, performance.uncomparable_count])}{show_info_tooltips && <InfoTooltip label={t('동일 조건의 수행 변화')}><span className="infoTooltipParagraph">{t('같은 종목의 기록 조건을 비교합니다. 자세·가동 범위·운동 강도가 같았는지는 현재 데이터로 확인할 수 없어요.')}</span>{performance.mixed_count > 0 && <span className="infoTooltipParagraph">{t('한 종목의 비교 조건에 따라 향상과 확인 필요가 함께 표시될 수 있어요.')}</span>}</InfoTooltip>}</p>
    {!show_info_tooltips && performance.mixed_count > 0 && <p className="infoText">{t('한 종목의 비교 조건에 따라 향상과 확인 필요가 함께 표시될 수 있어요.')}</p>}
    {performance.comparisons.length > 0 ? <PerformanceTable comparisons={performance.comparisons} detailed /> : <p className="infoText">{t('같은 종목·중량 또는 반복 조건의 비교 기록이 부족해요.')}</p>}
    {!show_info_tooltips && <p className="infoText">{t('같은 종목의 기록 조건을 비교합니다. 자세·가동 범위·운동 강도가 같았는지는 현재 데이터로 확인할 수 없어요.')}</p>}
  </>;
}
