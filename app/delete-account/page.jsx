import AccountDeletionForm from '../_components/account/AccountDeletionForm';
import LanguageSelector from '../_components/settings/LanguageSelector';
import safety_styles from '../_components/safety/Safety.module.css';

export const metadata = { title: "DON'T SKIP 계정 및 데이터 삭제" };

export default function AccountDeletionPage() {
  return <main className={safety_styles.page}>
    <LanguageSelector />
    <AccountDeletionForm is_public />
  </main>;
}
