import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';

export default function ExerciseResearchSummary({ latest_record, on_open, disabled = false }) {
  const { t } = useLanguage();
  return <div className="exerciseResearchSummary">
    <button className="textButton exerciseResearchOpen" type="button" aria-haspopup="dialog" disabled={disabled} onClick={on_open}>
      <MaterialIcon>edit_note</MaterialIcon>{t('연구 기록')}<MaterialIcon>chevron_right</MaterialIcon>
    </button>
    {latest_record ? <p className="exerciseResearchContent"><span className="exerciseResearchLatest">{t('최근 작성')}</span>{latest_record.content}</p>
      : <p className="exerciseResearchHint">{t('들은 조언이나 자극이 잘 온 방법을 남겨 보세요.')}</p>}
  </div>;
}
