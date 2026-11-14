import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import { notification_destination } from '../../_lib/notificationNavigation';
import MaterialIcon from '../ui/MaterialIcon';
import styles from './Notifications.module.css';

const category_labels = {
  mentor_message: ['forum', '코칭 메시지'], mentor_research_edit: ['edit_note', '연구일지'],
  workout_reminder: ['fitness_center', '운동'], push_test: ['notifications', '알림 테스트'],
};

export default function NotificationInbox({ inbox, on_close, on_open_notification }) {
  const { t, language, localize_message } = useLanguage();
  const dialog_ref = useRef(null);
  const mounted_ref = useRef(false);
  const [navigation_error, set_navigation_error] = useState('');
  useEffect(() => {
    const dialog = dialog_ref.current;
    mounted_ref.current = true;
    const previously_focused = document.activeElement;
    const previous_overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      mounted_ref.current = false;
      dialog.close();
      document.body.style.overflow = previous_overflow;
      if (previously_focused?.isConnected) previously_focused.focus({ preventScroll: true });
    };
  }, []);
  const date_formatter = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const open_notification = async (notification) => {
    set_navigation_error('');
    const destination = notification_destination(notification);
    if (!destination) {
      set_navigation_error('이 알림의 연결 화면을 찾을 수 없습니다.');
      return;
    }
    if (await inbox.mark_read(notification) && mounted_ref.current) on_open_notification(notification, destination);
  };
  return <dialog ref={dialog_ref} className={styles.dialog} id="notification-inbox" aria-labelledby="notification-inbox-title"
    onCancel={(event) => { event.preventDefault(); on_close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) on_close(); }}>
    <header className={styles.header}>
      <div><h2 id="notification-inbox-title">{t('알림')}</h2><p aria-live="polite">{t('읽지 않은 알림 {0}개', [inbox.unread_count])}</p></div>
      <div className={styles.actions}>
        <button className="settingsButton" type="button" onClick={inbox.refresh} disabled={inbox.loading || !inbox.can_retry || Boolean(inbox.reading_uuid)} aria-label={t('알림 새로고침')}><MaterialIcon>refresh</MaterialIcon></button>
        <button className="settingsButton" type="button" onClick={on_close} aria-label={t('알림 닫기')} autoFocus><MaterialIcon>close</MaterialIcon></button>
      </div>
    </header>
    <div className={styles.content} aria-busy={inbox.loading}>
      {(inbox.error || navigation_error) && <p className="errorText" role="alert">{localize_message(inbox.error || navigation_error)}</p>}
      {!inbox.can_retry && <p className={styles.message}>{t('재시도 횟수를 초과했습니다. 화면을 다시 열어 주세요.')}</p>}
      {inbox.loading && <p className={styles.message} role="status">{t('알림을 불러오는 중…')}</p>}
      {!inbox.loading && !inbox.error && inbox.notifications.length === 0 && <div className={styles.empty}>
        <MaterialIcon>notifications_none</MaterialIcon><h3>{t('아직 받은 알림이 없습니다.')}</h3><p>{t('운동·챌린지·코칭 알림을 여기에서 확인할 수 있습니다.')}</p>
      </div>}
      <ul className={styles.list}>{inbox.notifications.map((notification) => {
        const [icon, label] = category_labels[notification.category] || ['groups', '챌린지'];
        const notification_time = new Date(notification.created_at);
        return <li key={notification.notification_uuid}>
          <button type="button" className={`${styles.item} ${!notification.read_at ? styles.unread : ''}`}
            disabled={Boolean(inbox.reading_uuid)} onClick={() => open_notification(notification)}>
            <span className={styles.icon}><MaterialIcon>{icon}</MaterialIcon></span>
            <span className={styles.text}>
              <span className={styles.meta}><span>{t(label)}</span>{!Number.isNaN(notification_time.getTime()) && <time dateTime={notification.created_at}>{date_formatter.format(notification_time)}</time>}</span>
              <strong>{language === 'en' && notification.title_en ? notification.title_en : t(notification.title)}</strong>
              <span className={styles.body}>{language === 'en' && notification.body_en ? notification.body_en : notification.custom_message ? notification.body : t(notification.body)}</span>
              {!notification.read_at && <span className={styles.unreadLabel}>{t('읽지 않음')}</span>}
            </span>
            <MaterialIcon>{inbox.reading_uuid === notification.notification_uuid ? 'hourglass_top' : 'chevron_right'}</MaterialIcon>
          </button>
        </li>;
      })}</ul>
      {inbox.next_cursor && <button className={`textButton ${styles.more}`} type="button" onClick={inbox.load_more}
        disabled={inbox.loading || !inbox.can_retry || Boolean(inbox.reading_uuid)}>{t('이전 알림 더 보기')}</button>}
    </div>
  </dialog>;
}
