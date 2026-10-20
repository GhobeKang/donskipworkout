import { useLanguage } from '../../_hooks/useLanguage';
import { exercise_label, format_workout_date } from '../../_lib/i18n';
import { personal_record_method, personal_record_text } from '../../_lib/personalRecords';
import MaterialIcon from '../ui/MaterialIcon';

export default function PersonalRecords({ records }) {
  const { t, language } = useLanguage();
  return <details className="personalRecords">
    <summary>
      <span>{t('개인 업적')}</span>
      <strong>{t('PR 갱신 {0}종목', [records.length])}</strong>
      <MaterialIcon>expand_more</MaterialIcon>
    </summary>
    <div className="personalRecordsBody">
      <p className="infoText">{t('이번 기간에 새로 쓴 나의 최고 기록')}</p>
      {records.length ? <ul className="personalRecordList">
        {records.map((record) => <li key={`${record.exercise_source}:${record.exercise_id}`}>
          <div><strong>{exercise_label(record, language)}</strong><small>{format_workout_date(record.current_best.workout_date, language)}</small></div>
          <p>{personal_record_text(record, language)}</p>
        </li>)}
      </ul> : <p className="infoText">{t('이번 기간에는 갱신한 PR이 없습니다.')}</p>}
      <p className="infoText">{t(personal_record_method)}</p>
    </div>
  </details>;
}
