'use client';

import { useLanguage } from '../../_hooks/useLanguage';
import { exercise_label } from '../../_lib/i18n';
import { muscle_target_label } from '../../_lib/exerciseClassification';
import { activity_calculation_lines, activity_number, activity_score_text, activity_volume_text, muscle_activity_reference_lines } from '../../_lib/anatomy/muscleActivity';
import report_styles from './MuscleActivityReport.module.css';

function ActivitySetRows({ records, t }) {
  return <ul className={report_styles.setEvidence}>{records.map((record) => <li key={record.set_id}>
    <span>{record.workout_date} · {record.effective_weight_kg === null
      ? t('체중 기록이 없어 부하 제외')
      : t('{0}kg × {1}회', [activity_number(record.effective_weight_kg), record.reps])}
      {record.weight_kg <= 0 && <small>{t('입력 중량 {0}kg · 당시 체중 {1}kg', [activity_number(record.weight_kg), activity_number(record.body_weight_kg)])}</small>}
      {!record.included_in_reference && <small>{t('진행 중인 주와 요일이 달라 이번 기준 계산에서 제외')}</small>}
    </span>
    <strong>{activity_volume_text(record.volume_kg, t)}</strong>
  </li>)}</ul>;
}

export default function MuscleActivityEvidence({ summary }) {
  const { t, language } = useLanguage();
  return <details className={report_styles.evidence}>
    <summary>{t('활동지수 계산 근거')}</summary>
    <div className={report_styles.evidenceIntro}>{muscle_activity_reference_lines(summary, t).map((line) => <p key={line}>{line}</p>)}</div>
    {summary.targets.map((target, target_index) => <section key={target_index}>
      <h4>{muscle_target_label(target, language)} · {t('활동지수')} {activity_score_text(target, t)}</h4>
      {activity_calculation_lines(target, t).map((line) => <p key={line}>{line}</p>)}
      {target.exercises.map((exercise) => <details className={report_styles.exerciseEvidence} key={exercise.exercise_key}>
        <summary>{exercise_label(exercise, language)} · {t('{0}세트', [exercise.set_count])}
          {exercise.exercise_id === null && <small> · {t('삭제한 종목')}</small>}
        </summary>
        {activity_calculation_lines(exercise, t).map((line) => <p key={line}>{line}</p>)}
        {exercise.sets?.length > 0 && <>
          <p>{t('현재 기간 세트별 부하')}</p>
          <ActivitySetRows records={exercise.sets} t={t} />
        </>}
        {exercise.baseline_sets?.length > 0 && <details>
          <summary>{t('기준 기간 세트별 부하')}</summary>
          <ActivitySetRows records={exercise.baseline_sets} t={t} />
        </details>}
      </details>)}
    </section>)}
  </details>;
}
