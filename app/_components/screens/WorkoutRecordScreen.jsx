import { exercise_label } from '../../_lib/i18n';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';
import SavedPhoto from '../checkin/SavedPhoto';

export default function WorkoutRecordScreen({ record, on_back }) {
  const { t, language } = useLanguage();
  return <section className="viewPanel isVisible">
    <header className="pageHeader simple recordDetailHeader">
      <button className="backButton" type="button" aria-label={t("운동 목록으로 돌아가기")} onClick={on_back}><MaterialIcon>arrow_back_ios</MaterialIcon></button>
      <div><p className="cardKicker">{record.workout_date}</p><h1>{t("운동 수행 기록")}</h1></div>
      <MaterialIcon>fitness_center</MaterialIcon>
    </header>
    <article className="recordDetailCard">
      <div className="recordDetailHeading"><h2>{record.title}</h2><span>{record.status}</span></div>
      <p className="recordDetailDate">{record.date}{t(" · 예정 시간 ")}{record.scheduled_time}</p>
      {record.note && record.note !== record.title && <p className="recordDetailNote">{record.note}</p>}
      {record.exercise_groups?.length ? <div className="recordDetailGroups">
        {record.exercise_groups.map((group, group_index) => <section className="recordDetailGroup" key={`${exercise_label(group, language)}:${group_index}`}>
          <h3>{exercise_label(group, language)}</h3>
          <ul>{group.sets.map((workout_set, set_index) => <li key={`${exercise_label(group, language)}:${set_index}`}>{t("{0}kg × {1}회", [workout_set.weight_kg, workout_set.reps])}</li>)}</ul>
        </section>)}
      </div> : <p className="emptyState">{t("이 기록에 저장된 운동 세트가 없습니다.")}</p>}
      {record.photo_path && <div className="recordDetailPhoto"><SavedPhoto photo_path={record.photo_path} alt={t("{0} 운동 인증 사진", [record.date])} /></div>}
    </article>
  </section>;
}
