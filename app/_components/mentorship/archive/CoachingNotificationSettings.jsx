import { useLanguage } from '../../../_hooks/useLanguage';
import styles from '../Mentorship.module.css';

export default function CoachingNotificationSettings({ status }) {
  const { t, localize_message } = useLanguage();
  if (!status) return null;
  return <article className={styles.card}>
    <h2>{t('코칭 로컬 알림')}</h2>
    <p className={styles.muted}>{t('새 메시지와 연구일지 수정을 기기 알림으로 알려드립니다. 앱 실행 중 1분마다, 앱 복귀와 인터넷 재연결 시 변경 내용을 확인합니다.')}</p>
    <p className={styles.muted}>{t('앱이 완전히 종료된 동안에는 새 변경을 확인할 수 없습니다.')}</p>
    {!status.supported ? <p className={styles.muted}>{t('로컬 알림은 Android·iOS 앱에서 사용할 수 있습니다.')}</p> : <>
      <p role="status">{t(status.permission === 'granted' ? '코칭 로컬 알림을 받을 수 있습니다.' : '코칭 로컬 알림을 받으려면 기기 알림 권한이 필요합니다.')}</p>
      {status.permission === 'denied' && <p className={styles.muted}>{t('기기 설정에서 이 앱의 알림을 허용한 뒤 다시 확인해 주세요.')}</p>}
      {status.permission !== 'granted' && <button className="wideButton secondary" type="button" disabled={status.pending} onClick={status.request_permission}>{t(status.pending ? '확인 중…' : '기기 알림 권한 확인')}</button>}
      {status.error && <p className="errorText" role="alert">{localize_message(status.error)}</p>}
    </>}
  </article>;
}
