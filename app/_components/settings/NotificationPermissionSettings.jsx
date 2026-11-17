import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { enable_push_notifications } from '../../_lib/pushNotifications';
import { useLanguage } from '../../_hooks/useLanguage';

export default function NotificationPermissionSettings({ user_uuid, onboarding_required }) {
  const { t, language, localize_message } = useLanguage();
  const [permission, set_permission] = useState('checking');
  const [pending, set_pending] = useState(false);
  const [error, set_error] = useState('');
  const mounted_ref = useRef(true);
  const pending_ref = useRef(false);
  const is_native = Capacitor.isNativePlatform();
  useEffect(() => {
    mounted_ref.current = true;
    if (!is_native) return () => { mounted_ref.current = false; };
    PushNotifications.checkPermissions().then((result) => {
      if (mounted_ref.current) set_permission(result.receive);
    }).catch((request_error) => {
      console.error('[SETTINGS_PERMISSION_CHECK_ERROR]', request_error.name);
      if (mounted_ref.current) set_permission('unknown');
    });
    return () => { mounted_ref.current = false; };
  }, [is_native]);
  const request_permission = async () => {
    if (pending_ref.current) return;
    pending_ref.current = true;
    set_pending(true);
    set_error('');
    try {
      const result = await enable_push_notifications({ user_uuid, language, request_permission: true });
      if (mounted_ref.current) {
        set_permission(result.registered ? 'granted' : 'denied');
        if (result.registered) window.dispatchEvent(new Event('coaching-notifications-refresh'));
      }
    } catch (request_error) {
      if (mounted_ref.current) set_error(request_error.message);
    } finally {
      pending_ref.current = false;
      if (mounted_ref.current) set_pending(false);
    }
  };
  if (!is_native) return <p className="infoText">{t('이 환경에서는 기기 푸시 알림을 지원하지 않아요. 앱에서 설정할 수 있어요.')}</p>;
  if (onboarding_required) return <p className="infoText">{t('초기 설정을 완료하면 선택한 알림이 적용돼요.')}</p>;
  return <div>
    <p className="infoText" role="status">{permission === 'granted' ? t('기기 알림 권한이 허용되어 있어요.')
      : permission === 'denied' ? t('기기 알림이 꺼져 있어요. 기기 설정에서 이 앱의 알림을 허용해 주세요.')
      : t('버튼을 눌러 기기 알림 권한을 확인하고 연결해 주세요.')}</p>
    <button className="textButton" type="button" disabled={pending} onClick={request_permission}>
      {pending ? t('확인 중…') : permission === 'denied' || permission === 'granted' ? t('알림 연결 다시 확인') : t('알림 허용하기')}
    </button>
    {error && <p className="errorText" role="alert">{localize_message(error)}</p>}
  </div>;
}
