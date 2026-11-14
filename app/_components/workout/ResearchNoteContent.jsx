import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';
import styles from './ResearchNoteContent.module.css';

export default function ResearchNoteContent({ record, show_recent = false }) {
  const { t } = useLanguage();
  const is_mentor_edited = Boolean(record.edited_by_mentor);
  return <div className={is_mentor_edited ? styles.mentorNote : undefined}>
    {is_mentor_edited && <div className={styles.heading}>
      <span className={styles.mentorBadge}><MaterialIcon>school</MaterialIcon>{t('코치 수정')}</span>
      {show_recent && <span className="exerciseResearchLatest">{t('최근 작성')}</span>}
    </div>}
    <p className="exerciseResearchContent">
      {show_recent && !is_mentor_edited && <span className="exerciseResearchLatest">{t('최근 작성')}</span>}
      {record.content}
    </p>
  </div>;
}
