import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';
import ResearchNoteContent from './ResearchNoteContent';

export default function ExerciseResearchSummary({ latest_record, on_open, disabled = false }) {
  const { t } = useLanguage();
  return <div className="exerciseResearchSummary">
    <button className="textButton exerciseResearchOpen" type="button" aria-haspopup="dialog" disabled={disabled} onClick={on_open}>
      <MaterialIcon>edit_note</MaterialIcon>{t('연구 기록')}<MaterialIcon>chevron_right</MaterialIcon>
    </button>
    {latest_record ? <ResearchNoteContent record={latest_record} show_recent />
      : <p className="exerciseResearchHint">{t('들은 조언이나 자극이 잘 온 방법을 남겨 보세요.')}</p>}
  </div>;
}
