import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';

export default function StatusBar({ on_open_settings, settings_active = false, disabled = false }) {
  const { t } = useLanguage();
  return <header className="statusBar">
    <div className="statusBrand" aria-label="Don't Skip Workout">
      <img className="statusLogo" src="/assets/logo_dark_large.png" alt="" width="40" height="40" />
      <span className="statusLogoText">DON’T SKIP<span className="brandDot">.</span></span>
    </div>
    
    {on_open_settings && <button className="settingsButton" type="button" onClick={on_open_settings} disabled={disabled} aria-label={t("설정")} aria-current={settings_active ? 'page' : undefined}>
      <MaterialIcon>tune</MaterialIcon>
    </button>}
    
  </header>;
}
