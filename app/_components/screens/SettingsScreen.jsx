import { useLanguage } from '../../_hooks/useLanguage';
import { useState } from 'react';
import MaterialIcon from '../ui/MaterialIcon';
import ToggleButton from '../ui/ToggleButton';
import LanguageSelector from '../settings/LanguageSelector';
import CountryTimezoneFields from '../settings/CountryTimezoneFields';

const notification_fields = [
  { field_name: 'notification_workout_enabled', label: '운동 30분 전 알림' },
  {
    field_name: 'notification_missed_enabled',
    label: '미인증 재촉 알림',
    description: '출발 전에는 예정 시각 30·60·90분 뒤, 출발 후에는 3시간 뒤 미인증일 때 한 번만 보내요.',
  },
  { field_name: 'notification_snooze_enabled', label: '미루기 30분 뒤 알림' },
  {
    field_name: 'notification_free_workout_enabled',
    label: '자유운동 날 권유 알림',
    description: '정기 일정이 없는 날에도 운동 시간에 한 번만 부드럽게 권해요.',
  },
];

export default function SettingsScreen({ data, options, pending, on_save }) {
  const { t, language } = useLanguage();
  const [draft, set_draft] = useState(data);
  const change_field = (field_name, value) => set_draft((current) => ({ ...current, [field_name]: value }));
  const toggle_day = (day_index) => set_draft((current) => ({
    ...current, schedule_days: current.schedule_days.includes(day_index)
      ? current.schedule_days.filter((day) => day !== day_index)
      : [...current.schedule_days, day_index].sort(),
  }));
  const is_dirty = JSON.stringify(draft) !== JSON.stringify(data);
  return <section className="viewPanel isVisible">
    <header className="pageHeader"><div><p className="eyebrow">{t('의지 말고, 장치를 만들어.')}</p><h1>{t('내 운동의 룰.')}</h1></div></header>
    <article className="settingsCard"><LanguageSelector /></article>
    <form onSubmit={(event) => { event.preventDefault(); if (!pending && is_dirty) on_save(draft); }}>
      <fieldset className="settingsFields" disabled={pending}>
        <article className="settingsCard">
          <h2><MaterialIcon>calendar_month</MaterialIcon>{t(" 운동 일정")}</h2>
          <CountryTimezoneFields country_code={draft.country_code} timezone={draft.timezone} on_change={change_field} />
          <p className="infoText">{t('운동 요일과 시간은 선택한 시간대 기준입니다. 시간대를 바꾸면 앞으로의 알림에 적용되고 기존 운동 날짜는 유지됩니다.')}</p>
          <p className="infoText">{t('운동 요일과 알림은 저장 즉시 바뀌지만, 공유 평가의 목표 횟수는 다음 주부터 바뀌어요. 지난 약속은 바뀌지 않아요.')}</p>
          <div className="settingRow"><span>{t("운동 요일 및 시간")}</span><span>{draft.schedule_days.length ? draft.schedule_days.map((day) => options.day_names[day]).join(' / ') : t("정기 일정 없음")} {draft.workout_time}</span></div>
          <div className="weekdayPicker">{options.day_names.map((day, index) => <button type="button" className={'weekdayButton' + (draft.schedule_days.includes(index) ? ' isSelected' : '')} key={day} aria-pressed={draft.schedule_days.includes(index)} onClick={() => toggle_day(index)}>{day}</button>)}</div>
          <label className="fieldLabel" htmlFor="workout-time">{t("운동 시간")}</label>
          {language === 'en' ? <div className="workoutTimePicker">
            <select className="timeInput" id="workout-time" aria-label="Workout time hours" value={draft.workout_time.slice(0, 2)} onChange={(event) => change_field('workout_time', `${event.target.value}:${draft.workout_time.slice(3, 5)}`)}>
              {Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0')).map((hour) => <option key={hour} value={hour}>{hour}</option>)}
            </select><span aria-hidden="true">:</span>
            <select className="timeInput" aria-label="Workout time minutes" value={draft.workout_time.slice(3, 5)} onChange={(event) => change_field('workout_time', `${draft.workout_time.slice(0, 2)}:${event.target.value}`)}>
              {Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0')).map((minute) => <option key={minute} value={minute}>{minute}</option>)}
            </select>
          </div> : <input className="timeInput" id="workout-time" type="time" required value={draft.workout_time} onChange={(event) => change_field('workout_time', event.target.value)} />}
        </article>
        <article className="settingsCard">
          <h2><MaterialIcon>notifications</MaterialIcon>{t(" 알림 설정")}</h2>
          <p className="infoText">{t("정기 운동 알림과 자유운동 날 권유 알림을 각각 설정할 수 있습니다. 앱 알림 권한이 필요합니다.")}</p>
          <p className="infoText">{t('지금 출발을 누르면 당일 일반 운동 알림은 중단됩니다. 3시간 안에 인증하면 재촉 알림도 보내지 않습니다.')}</p>
          {notification_fields.map(({ field_name, label, description }) => <div className="toggleRow" key={field_name}><span>{t(label)}{description && <small>{t(description)}</small>}</span><ToggleButton active={draft[field_name]} label={t(label)} onClick={() => change_field(field_name, !draft[field_name])} /></div>)}
        </article>
        <article className="settingsCard"><h2>{t("기록 재사용")}</h2><div className="toggleRow"><span>{t("과거 기록 다시 보기")}<small>{t("동의한 과거 기록을 오늘 화면에서 보여줘요.")}</small></span><ToggleButton active={draft.reuse_enabled} label={t("과거 기록 다시 보기")} onClick={() => change_field('reuse_enabled', !draft.reuse_enabled)} /></div></article>
        <article className="settingsCard roastCard">
          <h2><MaterialIcon>local_fire_department</MaterialIcon>{t(" 자극 강도 설정")}</h2>
          <div className="roastOptions">{Object.entries(options.roast_labels).map(([level, label]) => <button type="button" className={draft.roast_level === level ? 'isSelected' : ''} key={level} aria-pressed={draft.roast_level === level} onClick={() => change_field('roast_level', level)}>{label}</button>)}</div>
          <div className="roastPreview"><MaterialIcon>format_quote</MaterialIcon><p>{options.roast_quotes[draft.roast_level]}</p></div>
        </article>
        <p className="infoText" role="status">{is_dirty ? t("저장하지 않은 변경 사항이 있습니다. 이동 전에 저장해 주세요.") : t("저장된 설정입니다.")}</p>
        <button className="wideButton primary" type="submit" disabled={!is_dirty}>{pending ? t("저장 중…") : t("설정 저장")}</button>
        {is_dirty && <button className="textButton" type="button" onClick={() => set_draft(data)}>{t("변경 취소")}</button>}
      </fieldset>
    </form>
  </section>;
}
