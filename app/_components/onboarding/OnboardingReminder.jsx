import { useLanguage } from '../../_hooks/useLanguage';
import onboarding_styles from './Onboarding.module.css';

export default function OnboardingReminder({ pending, error, on_resume }) {
  const { t, localize_message } = useLanguage();
  return <aside className={onboarding_styles.reminder}>
    <strong>{t('초기 설정')}</strong>
    <button className="quietButton" type="button" disabled={pending} onClick={on_resume}>{pending ? t('확인 중…') : t('이어서 설정하기')}</button>
    {error && <p className="errorText" role="alert">{localize_message(error)}</p>}
  </aside>;
}
