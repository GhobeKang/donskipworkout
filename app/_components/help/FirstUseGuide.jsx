import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';
import HelpLink from './HelpLink';
import { useHelp } from './HelpProvider';
import help_styles from './Help.module.css';

export default function FirstUseGuide() {
  const { t } = useLanguage();
  const { first_use_guide } = useHelp();
  if (!first_use_guide.is_visible) return null;
  return <aside className={help_styles.firstUseCard} aria-labelledby="first-use-guide-title">
    <div className={help_styles.cardHeading}><h2 id="first-use-guide-title">{t('처음이신가요?')}</h2>
      <button type="button" className="quietButton" aria-label={t('처음 사용 안내 닫기')} onClick={first_use_guide.dismiss_guide}><MaterialIcon>close</MaterialIcon></button>
    </div>
    <p>{t('출석부터 한 번 남겨 보세요. 세트 기록과 시간 측정은 별도로 이용할 수 있어요.')}</p>
    <HelpLink question_id="first-checkin">{t('첫 출석 방법 보기')}</HelpLink>
    <small>{t('닫은 안내는 설정의 사용 가이드에서 다시 볼 수 있어요.')}</small>
  </aside>;
}
