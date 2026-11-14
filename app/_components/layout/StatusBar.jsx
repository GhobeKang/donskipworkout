import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';

export default function StatusBar({ on_open_settings, on_open_notifications, unread_count = 0, notifications_open = false, settings_active = false, disabled = false }) {
  const { t } = useLanguage();
  return <header className="statusBar">
    <div className="statusBrand" aria-label="Don't Skip Workout">
      <img className="statusLogo" src="/assets/logo_dark_large.png" alt="" width="40" height="40" />
      <span className="statusLogoText">DON’T SKIP<span className="brandDot">.</span></span>
    </div>
    <div className="statusActions">
    {on_open_notifications && <button className="settingsButton notificationButton" type="button" onClick={on_open_notifications} disabled={disabled}
      aria-label={unread_count ? t('알림, 읽지 않은 알림 {0}개', [unread_count]) : t('알림')}
      aria-haspopup="dialog" aria-expanded={notifications_open} aria-controls={notifications_open ? 'notification-inbox' : undefined}>
      <MaterialIcon>notifications</MaterialIcon>
      {unread_count > 0 && <span className="notificationBadge" aria-hidden="true">{unread_count > 99 ? '99+' : unread_count}</span>}
    </button>}
    {on_open_settings && <button className="settingsButton" type="button" onClick={on_open_settings} disabled={disabled} aria-label={t("설정")} aria-current={settings_active ? 'page' : undefined}>
      <MaterialIcon>tune</MaterialIcon>
    </button>}
    </div>
  </header>;
}
