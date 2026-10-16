'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { api_request } from '../../_lib/api';
import {
  enable_push_notifications, get_push_installation_uuid,
  get_push_registration_state, get_server_push_registration_state, subscribe_push_registration,
} from '../../_lib/pushNotifications';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';

const delivery_labels = {
  queued: '전송 대기', processing: '전송 중', provider_accepted: '전송 요청 수락',
  failed: '전송 실패', cancelled: '전송 취소',
};
const worker_error_labels = {
  provider_not_configured: '서버에 푸시 발송 설정이 없습니다. 서버 설정을 확인해야 합니다.',
  fcm_initialization_failed: '서버의 Android 푸시 인증 설정을 확인해야 합니다.',
  apns_initialization_failed: '서버의 iOS 푸시 인증 설정을 확인해야 합니다.',
  workout_schedule_failed: '서버에서 운동 알림 일정을 계산하지 못했습니다.',
  push_batch_failed: '서버에서 알림 전송 작업을 처리하지 못했습니다.',
};

export default function ServerNotificationSettings({ user_uuid, on_unauthorized, on_notify }) {
  const { t, language, localize_message } = useLanguage();
  const registration_state = useSyncExternalStore(
    subscribe_push_registration, get_push_registration_state, get_server_push_registration_state,
  );
  const own_registration = registration_state.user_uuid === user_uuid && registration_state.language === language
    ? registration_state : null;
  const registration_phase = own_registration?.phase || 'idle';
  const registration_revision = own_registration?.revision || 0;
  const automatic_registration_pending = ['checking', 'requesting', 'registering'].includes(registration_phase);
  const [status, set_status] = useState(null);
  const [is_native, set_is_native] = useState(false);
  const [active_action, set_active_action] = useState(null);
  const [status_loading, set_status_loading] = useState(true);
  const [checked_at, set_checked_at] = useState(null);
  const [error_message, set_error_message] = useState('');
  const [success_message, set_success_message] = useState('');
  const mounted = useRef(true);
  const action_controller = useRef(null);
  const status_request_id = useRef(0);
  const refresh_status = useCallback(async (signal) => {
    const request_id = ++status_request_id.current;
    set_status_loading(true);
    try {
      const result = await api_request('/notifications/status', {signal});
      if (mounted.current && !signal?.aborted && request_id === status_request_id.current) {
        set_status(result);
        set_checked_at(new Date());
      }
      return result;
    } finally {
      if (mounted.current && !signal?.aborted && request_id === status_request_id.current) set_status_loading(false);
    }
  }, []);
  const run_action = async (action_name, action) => {
    if (action_controller.current) return;
    const controller = new AbortController();
    action_controller.current = controller;
    set_active_action(action_name); set_error_message(''); set_success_message('');
    try { await action(controller.signal); }
    catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
    } finally {
      action_controller.current = null;
      if (mounted.current) set_active_action(null);
    }
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; action_controller.current?.abort(); };
  }, []);
  useEffect(() => {
    set_is_native(Capacitor.isNativePlatform());
    const controller = new AbortController();
    set_error_message(''); set_success_message('');
    refresh_status(controller.signal).catch((error) => {
      if (!controller.signal.aborted) {
        if (error.status === 401) on_unauthorized();
        else set_error_message(localize_message(error.message));
      }
    });
    return () => controller.abort();
  }, [user_uuid, registration_revision, refresh_status, on_unauthorized, localize_message]);

  const installation_uuid = is_native ? get_push_installation_uuid() : null;
  const current_device = status?.registered_devices?.find((device) => device.installation_uuid === installation_uuid);
  const device_registered = Boolean(current_device?.workout_push_enabled);
  const provider_ready = is_native ? (Capacitor.getPlatform() === 'android'
    ? status?.fcm_initialized : status?.apns_initialized)
    : status?.fcm_initialized || status?.apns_initialized;
  const worker_ready = Boolean(status?.worker_running && status?.scheduler_running && provider_ready);
  const worker_error = status && !worker_ready ? worker_error_labels[status.last_error]
    || (!provider_ready ? '서버의 푸시 발송 설정을 확인해야 합니다.' : '서버 운동 알림 작업이 실행 중인지 확인해야 합니다.') : '';
  const latest_delivery = status?.recent_deliveries?.[0]?.status;
  const registration_label = !is_native ? '앱에서 사용 가능'
    : automatic_registration_pending ? '자동 등록 중…'
    : registration_phase === 'registered' && status_loading && !device_registered ? '등록 확인 중…'
    : registration_phase === 'denied' ? '알림 권한 필요'
    : device_registered ? '등록 완료'
    : registration_phase === 'failed' ? '등록 실패' : '자동 등록 대기';
  const registration_error = own_registration?.phase === 'failed'
    ? localize_message(own_registration.error_message) : '';
  const needs_recovery = is_native && !automatic_registration_pending && (
    ['failed', 'denied'].includes(registration_phase)
    || (registration_phase === 'registered' && status && !status_loading && !device_registered)
  );
  const busy = active_action !== null;
  return <article className="settingsCard" aria-busy={busy || status_loading || automatic_registration_pending}>
    <h2><MaterialIcon>cloud</MaterialIcon>{t('서버 푸시 알림')}</h2>
    <p className="infoText">{t('운동 알림은 서버에서 전송합니다. 앱을 열지 않아도 받을 수 있으며 인터넷 연결과 알림 권한이 필요합니다.')}</p>
    {is_native && <p className="infoText">{t('알림 권한에 동의하면 이 기기는 자동으로 등록됩니다.')}</p>}
    {status ? <div className="serverNotificationStatus">
      <p>{t('서버 알림 작업')}<strong>{t(worker_ready ? '실행 중' : '확인 필요')}</strong></p>
      <p>{t('이 기기 등록')}<strong>{t(registration_label)}</strong></p>
      <p>{t('최근 발송')}<strong>{t(latest_delivery ? delivery_labels[latest_delivery] || '확인 필요' : '발송 기록 없음')}</strong></p>
      {checked_at && <p>{t('마지막 확인')}<strong>{checked_at.toLocaleTimeString(language === 'en' ? 'en-US' : 'ko-KR', {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</strong></p>}
    </div> : status_loading && <p className="infoText" role="status">{t('발송 상태 확인 중…')}</p>}
    {worker_error && <p className="timerError" role="alert">{t(worker_error)}</p>}
    {automatic_registration_pending && <p className="infoText" role="status">{t(registration_phase === 'requesting' ? '알림 권한 동의를 기다리고 있습니다.' : '알림 권한 확인 후 기기를 자동으로 등록하고 있습니다.')}</p>}
    {registration_phase === 'denied' && is_native && <p className="infoText">{t('기기 설정에서 알림을 허용한 뒤 앱으로 돌아오세요.')}</p>}
    {registration_error && <p className="timerError" role="alert">{registration_error}</p>}
    {!is_native && <p className="infoText">{t('푸시 알림은 Android·iOS 앱에서 받을 수 있습니다.')}</p>}
    <div className="secondaryActions">
      {needs_recovery && <button className="quietButton" type="button" disabled={busy} onClick={() => run_action('register', async (signal) => {
        const result = await enable_push_notifications({user_uuid, language});
        if (signal.aborted) return;
        if (!result.registered) throw new Error(t('푸시 알림을 받으려면 알림 권한이 필요합니다.'));
        await refresh_status(signal);
        if (signal.aborted) return;
        set_success_message(t('서버 푸시 기기를 등록했습니다.'));
        on_notify(t('서버 푸시 기기를 등록했습니다.'));
      })}>{t(active_action === 'register' ? '기기 등록 중…' : registration_phase === 'denied' ? '알림 권한 확인' : '기기 등록 다시 시도')}</button>}
      <button className="quietButton" type="button" disabled={busy || status_loading} onClick={() => run_action('status', async (signal) => {
        await refresh_status(signal);
        if (!signal.aborted) set_success_message(t('발송 상태를 확인했습니다.'));
      })}>{t(active_action === 'status' ? '발송 상태 확인 중…' : '발송 상태 확인')}</button>
      {is_native && <button className="quietButton" type="button" disabled={busy || !worker_ready || !device_registered || automatic_registration_pending || registration_phase === 'denied'} onClick={() => run_action('test', async (signal) => {
        await api_request('/notifications/test?installation_uuid=' + installation_uuid, {method:'POST', body:{}, signal});
        if (!signal.aborted) set_success_message(t('15초 뒤 서버 테스트 알림을 전송합니다. 앱을 내려놓고 수신을 확인해 주세요.'));
      })}>{t(active_action === 'test' ? '테스트 알림 요청 중…' : '15초 서버 테스트 알림')}</button>}
    </div>
    {error_message && <p className="timerError" role="alert">{error_message}</p>}
    {success_message && <p className="infoText" role="status">{success_message}</p>}
  </article>;
}
