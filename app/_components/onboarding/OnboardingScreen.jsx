import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { request_push_notification_permission } from '../../_lib/pushNotifications';
import { useLanguage } from '../../_hooks/useLanguage';
import StatusBar from '../layout/StatusBar';
import CountryTimezoneFields from '../settings/CountryTimezoneFields';
import WorkoutScheduleFields from '../settings/WorkoutScheduleFields';
import ToggleButton from '../ui/ToggleButton';
import onboarding_styles from './Onboarding.module.css';

const setup_steps = [
  { label: '시간대', title: '시간대 설정', description: '운동 일정과 알림에 적용돼요.' },
  { label: '운동 일정', title: '운동 일정' },
  { label: '체중', title: '현재 체중', description: '선택 입력' },
  { label: '알림', title: '알림 설정' },
];
const notification_fields = [
  { name: 'notification_workout_enabled', label: '운동 30분 전 알림' },
  { name: 'notification_snooze_enabled', label: '미루기 30분 뒤 알림' },
  { name: 'notification_missed_enabled', label: '미인증 재촉 알림', description: '예정 시각 30·60·90분 뒤, 출발 후 3시간 뒤' },
  { name: 'notification_free_workout_enabled', label: '자유운동 날 권유 알림' },
];

export default function OnboardingScreen({ data, pending, error, on_reload, on_save }) {
  const { t, language, localize_message } = useLanguage();
  const [draft, set_draft] = useState(data.draft);
  const [current_step, set_current_step] = useState(data.current_step);
  const [permission, set_permission] = useState('checking');
  const [permission_pending, set_permission_pending] = useState(false);
  const [permission_error, set_permission_error] = useState('');
  const heading_ref = useRef(null);
  const mounted_ref = useRef(true);
  const permission_pending_ref = useRef(false);
  const permission_revision = useRef(0);
  const is_native = Capacitor.isNativePlatform();
  const day_names = language === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['일', '월', '화', '수', '목', '금', '토'];
  const step = setup_steps[current_step];
  const busy = pending || permission_pending;
  const change_field = (field_name, value) => set_draft((current) => ({ ...current, [field_name]: value }));
  const notification_selected = notification_fields.some(({ name }) => draft[name]);

  useEffect(() => {
    mounted_ref.current = true;
    if (!is_native) set_permission('unsupported');
    else PushNotifications.checkPermissions().then((result) => {
      if (mounted_ref.current) set_permission(result.receive);
    }).catch((request_error) => {
      console.error('[ONBOARDING_PERMISSION_CHECK_ERROR]', request_error.name);
      if (mounted_ref.current) set_permission('unknown');
    });
    return () => { mounted_ref.current = false; };
  }, [is_native]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    heading_ref.current?.focus({ preventScroll: true });
  }, [current_step]);

  const move_to = async (next_step, next_draft = draft) => {
    const result = await on_save(next_draft, next_step);
    if (result && mounted_ref.current) {
      set_draft(next_draft);
      set_current_step(next_step);
    }
  };
  const defer_setup = async () => {
    await on_save(draft, current_step, 'deferred');
  };
  const continue_without_notifications = () => move_to(4, { ...draft, notification_choice: 'later' });
  const choose_notifications = async () => {
    if (busy || permission_pending_ref.current) return;
    if (!is_native || !notification_selected) return continue_without_notifications();
    permission_pending_ref.current = true;
    const request_revision = ++permission_revision.current;
    set_permission_pending(true);
    set_permission_error('');
    let timeout_id;
    try {
      const result = await Promise.race([
        request_push_notification_permission(),
        new Promise((_, reject) => {
          timeout_id = setTimeout(() => reject(new Error('알림 권한 확인 응답이 없습니다. 나중에 설정에서 다시 확인해 주세요.')), 20000);
        }),
      ]);
      if (!mounted_ref.current || permission_revision.current !== request_revision) return;
      set_permission(result);
      await move_to(4, { ...draft, notification_choice: 'enabled' });
    } catch (request_error) {
      console.error('[ONBOARDING_PERMISSION_REQUEST_ERROR]', request_error.name);
      if (mounted_ref.current) set_permission_error(request_error.message);
    } finally {
      clearTimeout(timeout_id);
      permission_pending_ref.current = false;
      if (mounted_ref.current) set_permission_pending(false);
    }
  };
  const submit_step = (event) => {
    event.preventDefault();
    if (busy) return;
    if (current_step === 3) choose_notifications();
    else if (current_step === 4) on_save(draft, 4, 'in_progress', true);
    else move_to(current_step + 1);
  };
  const schedule_summary = draft.schedule_days.length
    ? `${draft.schedule_days.map((day) => day_names[day]).join(' / ')} · ${draft.workout_time}` : t('정기 일정 없음');
  const permission_notice = !is_native ? t('알림은 모바일 앱에서 설정해 주세요.')
    : permission === 'denied' ? t('기기 설정에서 알림을 허용해 주세요.') : '';
  const summary_notice = draft.notification_choice === 'enabled' && permission !== 'granted'
    ? permission_notice || t('설정에서 알림 권한을 확인해 주세요.') : '';

  return <div className={`phoneShell ${onboarding_styles.shell}`}>
    <StatusBar />
    <main className={onboarding_styles.content}>
      <div className={onboarding_styles.topRow}>
        <p className="eyebrow">{t('초기 설정')}</p>
        <button className="quietButton" type="button" disabled={busy} onClick={defer_setup}>{t('나중에 하기')}</button>
      </div>
      <ol className={onboarding_styles.progress} aria-label={t('초기 설정 진행 단계')}>
        {setup_steps.map((item, index) => <li key={item.label} aria-current={current_step === index ? 'step' : undefined}
          className={index <= current_step ? onboarding_styles.activeStep : ''}>
          <span className={onboarding_styles.progressTrack} />
          <span>{`${index + 1}. `}{t(item.label)}</span>
        </li>)}
      </ol>
      <header className={`pageHeader ${onboarding_styles.heading}`}>
        <div>
          <h1 ref={heading_ref} tabIndex={-1}>{current_step === 4 ? t('설정 확인') : t(step.title)}</h1>
          {step?.description && <p className="infoText">{t(step.description)}</p>}
        </div>
      </header>
      <form className={onboarding_styles.form} onSubmit={submit_step}>
        <fieldset disabled={busy} className={onboarding_styles.fields}>
          {current_step === 0 && <article className={`settingsCard ${onboarding_styles.card}`}>
            <CountryTimezoneFields show_country={false} timezone={draft.timezone} on_change={change_field} />
          </article>}
          {current_step === 1 && <article className={`settingsCard ${onboarding_styles.card}`}>
            <WorkoutScheduleFields id_prefix="onboarding" schedule_days={draft.schedule_days} workout_time={draft.workout_time}
              day_names={day_names} on_change={change_field} show_summary={false} />
            <button className={`quietButton ${onboarding_styles.flexibleChoice}`} type="button" aria-pressed={!draft.schedule_days.length}
              onClick={() => change_field('schedule_days', [])}>{t('정기 일정 없음')}</button>
          </article>}
          {current_step === 2 && <article className={`settingsCard ${onboarding_styles.card}`}>
            <label className="fieldLabel" htmlFor="onboarding-body-weight">{t('체중 (kg)')}</label>
            <div className={onboarding_styles.weightField}><input id="onboarding-body-weight" name="body_weight_kg" type="number"
              inputMode="decimal" min="0.01" max="500" step="0.01" placeholder="0.0" value={draft.body_weight_kg ?? ''}
              onChange={(event) => change_field('body_weight_kg', event.target.value === '' ? null : event.target.value)} /><span aria-hidden="true">kg</span></div>
            <p className={onboarding_styles.hint}>{t('보조 운동량 계산에 사용해요. 기록 당시 체중이 없으면 이 체중으로 추정해요.')}</p>
          </article>}
          {current_step === 3 && <article className={`settingsCard ${onboarding_styles.card}`}>
            <div className="toggleRow"><span>{t(notification_fields[0].label)}</span>
              <ToggleButton active={draft.notification_workout_enabled} label={t(notification_fields[0].label)} onClick={() => change_field('notification_workout_enabled', !draft.notification_workout_enabled)} /></div>
            <details className={onboarding_styles.details}><summary>{t('추가 알림 선택')}</summary>
              {notification_fields.slice(1).map(({ name, label, description }) => <div className="toggleRow" key={name}><span>{t(label)}{description && <small>{t(description)}</small>}</span>
                <ToggleButton active={draft[name]} label={t(label)} onClick={() => change_field(name, !draft[name])} /></div>)}
            </details>
            {permission_notice && <p className={onboarding_styles.hint} role="status">{permission_notice}</p>}
          </article>}
          {current_step === 4 && <article className={`settingsCard ${onboarding_styles.card}`}>
            {[
              { label: '시간대', value: draft.timezone, index: 0 },
              { label: '운동 일정', value: schedule_summary, index: 1 },
              { label: '체중', value: draft.body_weight_kg == null ? t('나중에 입력') : `${draft.body_weight_kg} kg`, index: 2 },
              { label: '알림', value: draft.notification_choice === 'enabled' ? t('선택한 알림 사용') : t('알림 없이 시작'), index: 3 },
            ].map((item) => <button className={onboarding_styles.summaryRow} key={item.label} type="button"
              aria-label={t('{0} 수정', [t(item.label)])} onClick={() => move_to(item.index)}>
              <span><small>{t(item.label)}</small><strong>{item.value}</strong></span><span className={onboarding_styles.editLabel}>{t('수정')}</span></button>)}
            {summary_notice && <p className={onboarding_styles.hint} role="status">{summary_notice}</p>}
          </article>}
          {(error || permission_error) && <div className={onboarding_styles.error} role="alert"><p>{localize_message(error || permission_error)}</p>
            {error && <button className="textButton" type="button" onClick={on_reload}>{t('저장 상태 다시 불러오기')}</button>}</div>}
          <div className={onboarding_styles.actions}>
            <button className="wideButton primary" type="submit">{busy ? t('확인 중…') : current_step === 4 ? t('시작하기')
              : current_step === 3 ? !is_native || !notification_selected ? t('알림 없이 계속') : permission === 'granted' || permission === 'denied' ? t('이 설정으로 계속') : t('알림 허용하기') : t('다음')}</button>
            <div className={onboarding_styles.secondaryActions}>
              {current_step > 0 && <button className="quietButton" type="button" onClick={() => move_to(current_step - 1)}>{t('이전')}</button>}
              {current_step === 2 && <button className="quietButton" type="button" onClick={() => move_to(3, { ...draft, body_weight_kg: null })}>{t('건너뛰기')}</button>}
              {current_step === 3 && is_native && notification_selected && <button className="quietButton" type="button" onClick={continue_without_notifications}>{t('알림 없이 계속')}</button>}
            </div>
          </div>
        </fieldset>
      </form>
    </main>
  </div>;
}
