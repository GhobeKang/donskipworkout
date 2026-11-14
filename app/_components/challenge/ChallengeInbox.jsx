import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';

export default function ChallengeInbox({ on_open_notifications }) {
  const { t } = useLanguage();
  return <article className="challengeCard">
    <h2>{t('알림함')}</h2>
    <p className="infoText">{t('운동·챌린지·코칭 알림을 여기에서 확인할 수 있습니다.')}</p>
    <button className="wideButton secondary" type="button" onClick={on_open_notifications}>
      <MaterialIcon>notifications</MaterialIcon>{t('전체 알림 보기')}
    </button>
  </article>;
}
