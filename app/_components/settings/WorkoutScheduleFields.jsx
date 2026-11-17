import { useLanguage } from '../../_hooks/useLanguage';

export default function WorkoutScheduleFields({ schedule_days, workout_time, day_names, on_change, id_prefix = 'settings', show_summary = true }) {
  const { t, language } = useLanguage();
  const toggle_day = (day_index) => on_change('schedule_days', schedule_days.includes(day_index)
    ? schedule_days.filter((day) => day !== day_index)
    : [...schedule_days, day_index].sort((first, second) => first - second));
  return <>
    {show_summary ? <div className="settingRow"><span>{t('운동 요일 및 시간')}</span><span>{schedule_days.length
      ? schedule_days.map((day) => day_names[day]).join(' / ') : t('정기 일정 없음')} {workout_time}</span></div>
      : <p className="fieldLabel">{t('운동 요일')}</p>}
    <div className="weekdayPicker" role="group" aria-label={t('운동 요일')}>
      {day_names.map((day, index) => <button type="button" key={index}
        className={'weekdayButton' + (schedule_days.includes(index) ? ' isSelected' : '')}
        aria-pressed={schedule_days.includes(index)} onClick={() => toggle_day(index)}>{day}</button>)}
    </div>
    <label className="fieldLabel" htmlFor={`${id_prefix}-workout-time`}>{t('운동 시간')}</label>
    {language === 'en' ? <div className="workoutTimePicker">
      <select className="timeInput" id={`${id_prefix}-workout-time`} aria-label="Workout time hours"
        value={workout_time.slice(0, 2)} onChange={(event) => on_change('workout_time', `${event.target.value}:${workout_time.slice(3, 5)}`)}>
        {Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0')).map((hour) => <option key={hour} value={hour}>{hour}</option>)}
      </select><span aria-hidden="true">:</span>
      <select className="timeInput" aria-label="Workout time minutes" value={workout_time.slice(3, 5)}
        onChange={(event) => on_change('workout_time', `${workout_time.slice(0, 2)}:${event.target.value}`)}>
        {Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0')).map((minute) => <option key={minute} value={minute}>{minute}</option>)}
      </select>
    </div> : <input className="timeInput" id={`${id_prefix}-workout-time`} type="time" required
      value={workout_time} onChange={(event) => on_change('workout_time', event.target.value)} />}
  </>;
}
