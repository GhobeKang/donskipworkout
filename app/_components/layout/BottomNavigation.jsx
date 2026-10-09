import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';

function NavigationButton({ icon, label, active, on_click, disabled }) {
  return <button type="button" className={'navItem' + (active ? ' isActive' : '')} onClick={on_click} disabled={disabled} aria-current={active ? 'page' : undefined}><MaterialIcon>{icon}</MaterialIcon><span>{label}</span></button>;
}

export default function BottomNavigation({ current_view, on_navigate, disabled }) {
  const { t } = useLanguage();
  return <nav className="bottomNav" aria-label={t("주요 메뉴")}>
    <NavigationButton icon="home" label={t("오늘")} active={current_view === 'today' || current_view === 'checkin'} on_click={() => on_navigate('today')} disabled={disabled} />
    <NavigationButton icon="fitness_center" label={t("운동")} active={current_view === 'workout' || current_view === 'workout-library'} on_click={() => on_navigate('workout')} disabled={disabled} />
    <NavigationButton icon="calendar_month" label={t("기록")} active={current_view === 'record'} on_click={() => on_navigate('record')} disabled={disabled} />
    <NavigationButton icon="groups" label={t("내 챌린지")} active={current_view === 'challenge'} on_click={() => on_navigate('challenge')} disabled={disabled} />
  </nav>;
}
