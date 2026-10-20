import InfoTooltip from '../ui/InfoTooltip';
import { exercise_label } from '../../_lib/i18n';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';
import SavedPhoto from '../checkin/SavedPhoto';
import { useState } from 'react';
import useApiResource from '../../_hooks/useApiResource';
import RequestState from '../ui/RequestState';
import { format_workout_duration } from '../../_lib/workoutTime';
import ExercisePersonalBest from '../workout/ExercisePersonalBest';

export default function WorkoutRecordScreen({ record: initial_record, revision, on_unauthorized, on_back }) {
  const { t, language } = useLanguage();
  const [reload_count, set_reload_count] = useState(0);
  const record_resource = useApiResource(`/sessions/${initial_record.session_uuid}`, `${revision}:${reload_count}`, on_unauthorized);
  const record = record_resource.data || initial_record;
  const workout_time = record.workout_time;
  const format_duration = (seconds) => format_workout_duration(seconds, language);
  return <section className="viewPanel isVisible">
    <header className="pageHeader simple recordDetailHeader">
      <button className="backButton" type="button" aria-label={t("운동 목록으로 돌아가기")} onClick={on_back}><MaterialIcon>arrow_back_ios</MaterialIcon></button>
      <div><p className="cardKicker">{record.workout_date}</p><h1>{t("운동 수행 기록")}</h1></div>
      <MaterialIcon>fitness_center</MaterialIcon>
    </header>
    <RequestState loading={record_resource.loading} error={record_resource.error} on_retry={reload_count < 2 ? () => set_reload_count((value) => value + 1) : undefined} />
    <article className="recordDetailCard">
      <div className="recordDetailHeading"><h2>{record.title}</h2><span>{record.status}</span></div>
      <p className="recordDetailDate">{record.date}{t(" · 예정 시간 ")}{record.scheduled_time}</p>
      <section className="recordWorkoutTime" aria-label={t('운동 시간')}>
        <h3>{t('운동 시간')}{workout_time && <InfoTooltip label={t('운동 시간')}>{t('일시정지를 제외한 날짜별 운동 시간입니다.')}</InfoTooltip>}</h3>
        <strong>{format_duration(workout_time?.measured_seconds)}</strong>
        {workout_time ? <p>{t('타이머 측정 {0} · 직접 보정 {1}', [format_duration(workout_time.timer_recorded_seconds), format_duration(workout_time.self_reported_seconds)])}</p>
          : <p>{t('이 운동일에 확정된 타이머 측정 기록이 없습니다.')}</p>}
      </section>
      {record.note && record.note !== record.title && <p className="recordDetailNote">{record.note}</p>}
      {record.exercise_groups?.length ? <div className="recordDetailGroups">
        {record.exercise_groups.map((group, group_index) => <section className="recordDetailGroup" key={`${exercise_label(group, language)}:${group_index}`}>
          <h3>{exercise_label(group, language)}</h3>
          <ExercisePersonalBest previous_best={group.previous_best} sets={group.sets} />
          <ul>{group.sets.map((workout_set, set_index) => <li key={`${exercise_label(group, language)}:${set_index}`}>{t("{0}kg × {1}회", [workout_set.weight_kg, workout_set.reps])}</li>)}</ul>
        </section>)}
      </div> : <p className="emptyState">{t("이 기록에 저장된 운동 세트가 없습니다.")}</p>}
      {record.photo_path && <div className="recordDetailPhoto"><SavedPhoto photo_path={record.photo_path} alt={t("{0} 운동 인증 사진", [record.date])} /></div>}
    </article>
  </section>;
}
