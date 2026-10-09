'use client';

import { useEffect, useState } from 'react';
import { api_request } from '../../_lib/api';
import { useLanguage } from '../../_hooks/useLanguage';

const default_preferences = {
  room_news_enabled: true,
  host_nudge_enabled: true,
  quiet_start: '21:00',
  quiet_end: '09:00',
};

export default function ChallengeNotificationSettings({ round_uuid, on_unauthorized }) {
  const { t, localize_message } = useLanguage();
  const [preferences, set_preferences] = useState(default_preferences);
  const [loading, set_loading] = useState(true);
  const [saving, set_saving] = useState(false);
  const [error_message, set_error_message] = useState('');
  const [status_message, set_status_message] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api_request(`/challenge-rounds/${round_uuid}/notification-preferences`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) set_preferences(result); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) on_unauthorized();
        else set_error_message(localize_message(error.message));
      })
      .finally(() => { if (!controller.signal.aborted) set_loading(false); });
    return () => controller.abort();
  }, [localize_message, on_unauthorized, round_uuid]);

  const update_preference = (key, value) => set_preferences((current) => ({ ...current, [key]: value }));
  const save_preferences = async (event) => {
    event.preventDefault();
    if (saving) return;
    set_saving(true);
    set_error_message('');
    set_status_message('');
    try {
      await api_request(`/challenge-rounds/${round_uuid}/notification-preferences`, {
        method: 'PUT',
        body: {
          room_news_enabled: true,
          host_nudge_enabled: true,
          quiet_start: preferences.quiet_start,
          quiet_end: preferences.quiet_end,
        },
      });
      set_status_message(t('방해 금지 시간을 저장했습니다.'));
    } catch (error) {
      if (error.status === 401) on_unauthorized();
      else set_error_message(localize_message(error.message));
    } finally {
      set_saving(false);
    }
  };

  return <article className="challengeCard">
    <div className="sectionHeading"><h2>{t('방해 금지 시간')}</h2></div>
    {error_message && <p className="requestState" role="alert">{error_message}</p>}
    {status_message && <p className="challengeSuccess" role="status">{status_message}</p>}
    {loading ? <p className="infoText">{t('불러오는 중…')}</p> : <form className="challengeForm" onSubmit={save_preferences}>
      <p className="infoText">{t('방 소식과 방장 재촉은 앱 알림 권한이 켜진 기기에 기본 발송을 요청합니다. 방해 금지 시간은 서버에서 확인해 발송을 미룹니다.')}</p>
      <div className="challengeQuietHours"><label>{t('방해 금지 시작')}<input type="time" value={preferences.quiet_start} onChange={(event) => update_preference('quiet_start', event.target.value)} /></label><label>{t('방해 금지 종료')}<input type="time" value={preferences.quiet_end} onChange={(event) => update_preference('quiet_end', event.target.value)} /></label></div>
      <button className="wideButton secondary" type="submit" disabled={saving}>{saving ? t('저장 중…') : t('방해 금지 시간 저장')}</button>
    </form>}
  </article>;
}
