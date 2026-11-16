import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';
import { useHelp } from './HelpProvider';
import help_styles from './Help.module.css';

export default function HelpLink({ question_id = null, children, entry = false }) {
  const { t } = useLanguage();
  const { open_help } = useHelp();
  return <button type="button" className={entry ? help_styles.guideEntry : help_styles.helpLink}
    aria-haspopup="dialog" onClick={() => open_help(question_id)}>
    <MaterialIcon>{entry ? 'menu_book' : 'help_outline'}</MaterialIcon>
    {entry ? <span><strong>{t('사용 가이드')}</strong><small>{t('처음 사용하기 · 자주 묻는 질문')}</small></span>
      : <span>{children || t('사용 방법 보기')}</span>}
    {entry && <MaterialIcon>chevron_right</MaterialIcon>}
  </button>;
}
