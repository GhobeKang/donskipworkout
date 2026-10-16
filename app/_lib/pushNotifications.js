'use client';

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { api_request } from './api';
import { prepare_workout_notifications_for_user } from './notifications';
import { translate } from './i18n';

const installation_storage_key = 'attendance_push_installation_uuid';
const registration_timeout_ms = 15000;
let pending_registration = null;
let pending_registration_key = null;
let pending_permission_request = false;
const initial_registration_state = {phase: 'idle', user_uuid: null, language: null, error_message: '', revision: 0};
let registration_state = initial_registration_state;
const registration_listeners = new Set();

export function get_push_registration_state() { return registration_state; }
export function get_server_push_registration_state() { return initial_registration_state; }
export function subscribe_push_registration(listener) {
  registration_listeners.add(listener);
  return () => registration_listeners.delete(listener);
}
function update_registration_state(user_uuid, language, phase, error_message = '') {
  registration_state = {user_uuid, language, phase, error_message,
    revision: registration_state.revision + (phase === 'registered' ? 1 : 0)};
  registration_listeners.forEach((listener) => listener());
}

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

async function remove_registration_listeners(...listeners) {
  let timeout_id;
  try {
    await Promise.race([
      Promise.allSettled(listeners.filter(Boolean).map((listener) => listener.remove())),
      new Promise((resolve) => {
        timeout_id = setTimeout(() => {
          console.warn('Push listener cleanup did not respond.');
          resolve();
        }, 1000);
      }),
    ]);
  } finally { clearTimeout(timeout_id); }
}

async function register_push_device({ user_uuid, language = 'ko' }) {
  let registration_listener;
  let registration_error_listener;
  let timeout_id;
  let disposed = false;
  const controller = new AbortController();
  const installation_uuid = get_push_installation_uuid();
  let resolve_registration;
  let reject_registration;
  const registration_result = new Promise((resolve, reject) => {
    resolve_registration = resolve; reject_registration = reject;
  });
  registration_result.catch(() => {});
  try {
    const operation = (async () => {
      await prepare_workout_notifications_for_user(user_uuid);
      if (disposed) return;
      if (Capacitor.getPlatform() === 'android') {
        for (const [id, name] of [['workout-push', '운동 알림'], ['server-push', '챌린지 알림']]) {
          await PushNotifications.createChannel({id, name: translate(name, [], language), importance: 4, visibility: 0, vibration: true});
          if (disposed) return;
        }
      }
      registration_listener = await PushNotifications.addListener('registration', async ({ value: token }) => {
        if (disposed) return;
        try {
          await api_request('/push-devices/current', {
            method: 'PUT', signal: controller.signal,
            body: {installation_uuid, platform: Capacitor.getPlatform(), token, user_uuid,
                   language, workout_push_enabled: true},
          });
          if (!disposed) resolve_registration({registered: true});
        } catch (error) { if (!disposed) reject_registration(error); }
      });
      if (disposed) { await remove_registration_listeners(registration_listener); return; }
      registration_error_listener = await PushNotifications.addListener('registrationError', (error) => {
        if (!disposed) reject_registration(new Error(error?.message || error?.error || '푸시 기기 등록에 실패했습니다.'));
      });
      if (disposed) { await remove_registration_listeners(registration_error_listener); return; }
      await PushNotifications.register();
      return registration_result;
    })();
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeout_id = setTimeout(() => reject(new Error('푸시 기기 등록 응답이 없습니다.')), registration_timeout_ms);
      }),
    ]);
  } finally {
    disposed = true; controller.abort(); clearTimeout(timeout_id);
    await remove_registration_listeners(registration_listener, registration_error_listener);
  }
}

async function activate_push_registration({user_uuid, language, request_permission}) {
  update_registration_state(user_uuid, language, 'checking');
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted' && request_permission) {
    update_registration_state(user_uuid, language, 'requesting');
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== 'granted'
      || (Capacitor.getPlatform() === 'android' && !(await LocalNotifications.areEnabled()).value)) {
    const installation_uuid = window.localStorage.getItem(installation_storage_key);
    if (installation_uuid) {
      await api_request('/push-devices/current?installation_uuid=' + installation_uuid, {method: 'DELETE'});
    }
    update_registration_state(user_uuid, language, 'denied');
    return {registered: false, reason: 'denied'};
  }
  update_registration_state(user_uuid, language, 'registering');
  const result = await register_push_device({user_uuid, language});
  update_registration_state(user_uuid, language, 'registered');
  return result;
}

export async function enable_push_notifications({ user_uuid, language = 'ko', request_permission = true } = {}) {
  if (!Capacitor.isNativePlatform()) return {registered: false, reason: 'web'};
  const registration_key = (user_uuid || '') + ':' + language;
  // Share the permission flow too, so automatic setup and a recovery tap cannot prompt twice.
  while (pending_registration && (pending_registration_key !== registration_key
      || (request_permission && !pending_permission_request))) {
    const same_account = pending_registration_key === registration_key;
    const result = await pending_registration.catch(() => null);
    if (same_account && result?.registered) return result;
  }
  if (!pending_registration) {
    pending_registration_key = registration_key;
    pending_permission_request = request_permission;
    pending_registration = activate_push_registration({user_uuid, language, request_permission})
      .catch((error) => {
        update_registration_state(user_uuid, language, 'failed', error.message || '푸시 기기 등록에 실패했습니다.');
        throw error;
      })
      .finally(() => {
        pending_registration = null; pending_registration_key = null; pending_permission_request = false;
      });
  }
  return pending_registration;
}

export function refresh_push_registration(options = {}) {
  return enable_push_notifications({...options, request_permission: false});
}
