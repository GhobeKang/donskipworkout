'use client';

import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useLanguage } from '../../_hooks/useLanguage';
import { WorkoutLocation } from '../../_lib/workoutLocation';
import MaterialIcon from '../ui/MaterialIcon';

export default function WorkoutLocationSettings({ user_uuid, on_notify }) {
  const { t, language } = useLanguage();
  const [status, set_status] = useState(null);
  const [is_native, set_is_native] = useState(false);
  const [place_name, set_place_name] = useState('');
  const [position, set_position] = useState(null);
  const [busy, set_busy] = useState(false);
  const [error_message, set_error_message] = useState('');
  const [success_message, set_success_message] = useState('');

  const refresh_status = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const next_status = await WorkoutLocation.getStatus({ user_uuid });
      set_status(next_status);
      set_place_name((current) => current || next_status.name || '');
    } catch (error) {
      set_error_message(t(error.message || '위치 설정을 확인하지 못했습니다.'));
    }
  }, [t, user_uuid]);

  useEffect(() => {
    set_is_native(Capacitor.isNativePlatform());
    refresh_status();
    const refresh_on_return = () => {
      if (document.visibilityState === 'visible') refresh_status();
    };
    document.addEventListener('visibilitychange', refresh_on_return);
    return () => document.removeEventListener('visibilitychange', refresh_on_return);
  }, [refresh_status]);

  const run_action = async (action) => {
    set_busy(true);
    set_error_message('');
    set_success_message('');
    let timeout_id;
    try {
      await Promise.race([
        Promise.resolve().then(action),
        new Promise((_, reject) => {
          timeout_id = setTimeout(() => reject(new Error(t('위치 요청 응답이 없습니다. 다시 확인해 주세요.'))), 15000);
        }),
      ]);
      await refresh_status();
    } catch (error) {
      console.error('[WORKOUT_LOCATION_ACTION_ERROR]', error.message || 'unknown');
      set_error_message(t(error.message || '위치 설정을 변경하지 못했습니다.'));
    } finally {
      clearTimeout(timeout_id);
      set_busy(false);
    }
  };

  const capture_position = () => run_action(async () => {
    const current_position = await WorkoutLocation.getCurrentPosition();
    set_position(current_position);
    set_success_message(t('현재 위치를 확인했습니다. 장소 이름을 입력하고 등록하세요.'));
  });

  const save_place = () => run_action(async () => {
    const permission = await LocalNotifications.checkPermissions();
    const notification_permission = permission.display === 'granted'
      ? permission : await LocalNotifications.requestPermissions();
    if (notification_permission.display !== 'granted') {
      throw new Error(t('도착 알림을 받으려면 알림 권한이 필요합니다.'));
    }
    const saved_place = {
      user_uuid,
      name: place_name.trim(),
      latitude: position.latitude,
      longitude: position.longitude,
      language,
    };
    await WorkoutLocation.savePlace(saved_place);
    set_status((current) => ({ ...current, name: saved_place.name, latitude: saved_place.latitude, longitude: saved_place.longitude }));
    set_position(null);
    on_notify(t('헬스장 위치를 저장했습니다.'));
  });

  const clear_place = () => run_action(async () => {
    await WorkoutLocation.clearPlace();
    set_status((current) => ({ ...current, name: '', latitude: null, longitude: null, registered: false }));
    set_place_name('');
    set_position(null);
    set_success_message(t('운동 장소를 삭제했습니다.'));
  });

  return <article className="settingsCard">
    <h2><MaterialIcon>location_on</MaterialIcon>{t(' 운동 장소 알림')}</h2>
    <p className="infoText">{t('장소에 도착해 잠시 머무르면 운동 시작 알림을 보냅니다. 알림을 눌러야 타이머가 시작됩니다.')}</p>
    {!is_native ? <p className="infoText">{t('위치 알림은 Android·iOS 앱에서 사용할 수 있습니다.')}</p> : <>
      {status?.name && <section className="savedWorkoutLocation" aria-label={t('저장된 헬스장')}>
        <p>{t('저장된 헬스장')}</p>
        <strong>{status.name}</strong>
        {Number.isFinite(status.latitude) && Number.isFinite(status.longitude) && <dl>
          <div><dt>{t('위도')}</dt><dd>{status.latitude.toFixed(6)}</dd></div>
          <div><dt>{t('경도')}</dt><dd>{status.longitude.toFixed(6)}</dd></div>
        </dl>}
      </section>}
      {status?.name && !status.registered && <p className="timerError" role="alert">{t('장소 감시가 꺼져 있습니다. 권한을 확인하고 다시 등록하세요.')}</p>}
      <div className="challengeForm">
        <label>{t('장소 이름')}<input value={place_name} maxLength={40} onChange={(event) => set_place_name(event.target.value)} placeholder={t('예: 자주 가는 헬스장')} /></label>
      </div>
      <div className="secondaryActions">
        {!status?.precise && <button className="quietButton" type="button" disabled={busy} onClick={() => run_action(() => WorkoutLocation.requestForegroundPermission())}>{t('정확한 위치 허용')}</button>}
        {status?.precise && !status?.background && <button className="quietButton" type="button" disabled={busy} onClick={() => run_action(() => WorkoutLocation.openBackgroundSettings())}>{t('항상 위치 허용')}</button>}
        {status?.precise && <button className="quietButton" type="button" disabled={busy} onClick={capture_position}>{t('현재 위치 확인')}</button>}
        <button className="quietButton" type="button" disabled={busy} onClick={refresh_status}>{t('권한 상태 다시 확인')}</button>
      </div>
      {position && <p className="infoText">{t('현재 위치 확인됨 · 오차 약 {0}m', [Math.round(position.accuracy)])}</p>}
      {!status?.background && <p className="infoText">{t('앱이 백그라운드에 있어도 도착을 감지하려면 위치 권한을 항상 허용으로 설정해야 합니다.')}</p>}
      <div className="secondaryActions">
        <button className="wideButton primary" type="button" disabled={busy || !position || !place_name.trim() || !status?.precise || !status?.background} onClick={save_place}>{t('이 장소 등록')}</button>
        {status?.name && <button className="quietButton" type="button" disabled={busy} onClick={clear_place}>{t('장소 삭제')}</button>}
      </div>
      {error_message && <p className="timerError" role="alert">{error_message}</p>}
      {success_message && <p className="infoText" role="status">{success_message}</p>}
    </>}
  </article>;
}

