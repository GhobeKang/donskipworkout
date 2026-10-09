'use client';

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { api_request } from './api';

const installation_storage_key = 'attendance_push_installation_uuid';
const registration_timeout_ms = 15000;
let pending_registration = null;

function create_installation_uuid() {
  const random_bytes = window.crypto.getRandomValues(new Uint8Array(16));
  random_bytes[6] = (random_bytes[6] & 0x0f) | 0x40;
  random_bytes[8] = (random_bytes[8] & 0x3f) | 0x80;
  const hex_value = Array.from(random_bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex_value.slice(0, 8)}-${hex_value.slice(8, 12)}-${hex_value.slice(12, 16)}-${hex_value.slice(16, 20)}-${hex_value.slice(20)}`;
}

export function get_push_installation_uuid() {
  if (!Capacitor.isNativePlatform()) return null;
  let installation_uuid = window.localStorage.getItem(installation_storage_key);
  if (!installation_uuid) {
    installation_uuid = create_installation_uuid();
    window.localStorage.setItem(installation_storage_key, installation_uuid);
  }
  return installation_uuid;
}

async function register_push_device() {
  let registration_listener;
  let registration_error_listener;
  let timeout_id;
  let resolve_registration;
  let reject_registration;
  const registration_result = new Promise((resolve, reject) => {
    resolve_registration = resolve;
    reject_registration = reject;
  });
  registration_result.catch(() => {});

  try {
    registration_listener = await PushNotifications.addListener('registration', async ({ value: token }) => {
      try {
        await api_request('/push-devices/current', {
          method: 'PUT',
          body: {
            installation_uuid: get_push_installation_uuid(),
            platform: Capacitor.getPlatform(),
            token,
          },
        });
        resolve_registration({ registered: true });
      } catch (error) {
        reject_registration(error);
      }
    });
    registration_error_listener = await PushNotifications.addListener('registrationError', (error) => {
      reject_registration(new Error(error?.message || error?.error || '푸시 기기 등록에 실패했습니다.'));
    });
    await PushNotifications.register();
    return await Promise.race([
      registration_result,
      new Promise((_, reject) => {
        timeout_id = setTimeout(() => reject(new Error('푸시 기기 등록 응답이 없습니다.')), registration_timeout_ms);
      }),
    ]);
  } finally {
    clearTimeout(timeout_id);
    await Promise.allSettled([registration_listener?.remove(), registration_error_listener?.remove()]);
  }
}

export async function enable_push_notifications() {
  if (!Capacitor.isNativePlatform()) return { registered: false, reason: 'web' };

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return { registered: false, reason: 'denied' };

  if (!pending_registration) {
    pending_registration = register_push_device().finally(() => { pending_registration = null; });
  }
  return pending_registration;
}

export async function refresh_push_registration() {
  if (!Capacitor.isNativePlatform()) return { registered: false, reason: 'web' };
  const permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') {
    const installation_uuid = window.localStorage.getItem(installation_storage_key);
    if (installation_uuid) {
      await api_request(`/push-devices/current?installation_uuid=${installation_uuid}`, { method: 'DELETE' });
    }
    return { registered: false, reason: 'permission_not_granted' };
  }
  return enable_push_notifications();
}
