'use client';

import { useCallback, useEffect, useState } from 'react';
import { api_request } from '../../_lib/api';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';

export default function ChallengeInbox({ is_active, on_unauthorized, on_open_room }) {
  const { t, localize_message } = useLanguage();
  const [notifications, set_notifications] = useState([]);
  const [error_message, set_error_message] = useState('');
  const load_inbox = useCallback(async (signal) => {
    try {
      const result = await api_request('/notifications/inbox?limit=10', { signal });
      if (!signal?.aborted) set_notifications(result.notifications);
    } catch (error) {
      if (signal?.aborted) return;
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
    }
  }, [localize_message, on_unauthorized]);

  useEffect(() => {
    if (!is_active) return undefined;
    const controller = new AbortController();
    load_inbox(controller.signal);
    return () => controller.abort();
  }, [is_active, load_inbox]);

  const open_notification = async (notification) => {
    try {
      await api_request(`/notifications/inbox/${notification.notification_uuid}/read`, { method: 'PUT' });
      set_notifications((current) => current.map((item) => item.notification_uuid === notification.notification_uuid
        ? { ...item, read_at: new Date().toISOString() }
        : item));
      if (notification.room_uuid) on_open_room(notification.room_uuid);
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
    }
  };

  return <article className="challengeCard">
    <div className="sectionHeading"><h2>{t('알림함')}</h2><button className="quietButton" type="button" onClick={() => load_inbox()} aria-label={t('알림 새로고침')}><MaterialIcon>refresh</MaterialIcon></button></div>
    {error_message && <p className="infoText" role="alert">{error_message}</p>}
    {notifications.length ? <ul className="challengeMemberList">{notifications.map((notification) => <li key={notification.notification_uuid}>
      <button className="challengeNotificationRow" type="button" onClick={() => open_notification(notification)}>
        <span><strong>{notification.category === 'room_deleted' ? t('{0} 방이 삭제되었습니다.', [notification.room_name]) : t(notification.title)}</strong><small>{t(notification.body)}</small></span>
        {!notification.read_at && <span className="challengeUnreadMark">{t('새 알림')}</span>}
      </button>
    </li>)}</ul> : <p className="emptyState">{t('새 알림이 없습니다.')}</p>}
  </article>;
}
