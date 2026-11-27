import { useLanguage } from '../../_hooks/useLanguage';
import { useState } from 'react';
import MaterialIcon from '../ui/MaterialIcon';
import ToggleButton from '../ui/ToggleButton';
import LanguageSelector from '../settings/LanguageSelector';
import CountryTimezoneFields from '../settings/CountryTimezoneFields';
import WorkoutScheduleFields from '../settings/WorkoutScheduleFields';
import NotificationPermissionSettings from '../settings/NotificationPermissionSettings';
import HelpLink from '../help/HelpLink';

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

export default function SettingsScreen({ data, options, user_uuid, onboarding_required, pending, on_save }) {
  const { t } = useLanguage();
  const [draft, set_draft] = useState(data);
  const change_field = (field_name, value) => set_draft((current) => ({ ...current, [field_name]: value }));
  const is_dirty = JSON.stringify(draft) !== JSON.stringify(data);
  const save_settings = (event) => {
    event.preventDefault();
    if (pending || !is_dirty) return;
    const settings_data = { ...draft };
    delete settings_data.country_code;
    on_save(settings_data);
  };
  return <section className="viewPanel isVisible">
    <header className="pageHeader"><div><p className="eyebrow">{t('의지 말고, 장치를 만들어.')}</p><h1>{t('내 운동의 룰.')}</h1></div></header>
    <article className="settingsCard"><LanguageSelector /></article>
    <form onSubmit={save_settings}>
      <fieldset className="settingsFields" disabled={pending}>
        <article className="settingsCard">
          <h2><MaterialIcon>calendar_month</MaterialIcon>{t(" 운동 일정")}</h2>
          <HelpLink question_id="schedule">{t('일정과 설정 저장 방법 보기')}</HelpLink>
          <CountryTimezoneFields show_country={false} timezone={draft.timezone} on_change={change_field} />
          <p className="infoText">{t('운동 요일과 시간은 선택한 시간대 기준입니다. 시간대를 바꾸면 앞으로의 알림에 적용되고 기존 운동 날짜는 유지됩니다.')}</p>
          <p className="infoText">{t('운동 요일과 알림은 저장 즉시 바뀌지만, 공유 평가의 목표 횟수는 다음 주부터 바뀌어요. 지난 약속은 바뀌지 않아요.')}</p>
          <WorkoutScheduleFields schedule_days={draft.schedule_days} workout_time={draft.workout_time} day_names={options.day_names} on_change={change_field} />
        </article>
        <article className="settingsCard">
          <h2><MaterialIcon>monitor_weight</MaterialIcon>{t(' 현재 체중')}</h2>
          <p className="infoText">{t('보조 운동량 계산에 사용해요. 기록 당시 체중이 없으면 이 체중으로 추정해요.')}</p>
          <label className="fieldLabel" htmlFor="settings-body-weight">{t('체중 (kg)')}</label>
          <input className="timeInput" id="settings-body-weight" name="body_weight_kg" type="number" inputMode="decimal"
            min="0.01" max="500" step="0.01" placeholder={t('선택 입력')} value={draft.body_weight_kg ?? ''}
            onChange={(event) => change_field('body_weight_kg', event.target.value === '' ? null : event.target.value)} />
        </article>
        <article className="settingsCard">
          <h2><MaterialIcon>notifications</MaterialIcon>{t(" 알림 설정")}</h2>
          <HelpLink question_id="notifications">{t('알림이 오지 않거나 자주 올 때')}</HelpLink>
          <p className="infoText">{t("정기 운동 알림과 자유운동 날 권유 알림을 각각 설정할 수 있습니다. 앱 알림 권한이 필요합니다.")}</p>
          <p className="infoText">{t('지금 출발을 누르면 당일 일반 운동 알림은 중단됩니다. 3시간 안에 인증하면 재촉 알림도 보내지 않습니다.')}</p>
          <NotificationPermissionSettings user_uuid={user_uuid} onboarding_required={onboarding_required} />
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
