import { AppLauncher } from '@capacitor/app-launcher';

const version_pattern = /^\d{1,9}(?:\.\d{1,9}){0,2}$/;
export const update_snooze_ms = 24 * 60 * 60 * 1000;

export function compare_app_versions(first_version, second_version) {
  if (!version_pattern.test(first_version) || !version_pattern.test(second_version)) return null;
  const first_parts = first_version.split('.').map(Number);
  const second_parts = second_version.split('.').map(Number);
  for (let part_index = 0; part_index < 3; part_index += 1) {
    const difference = (first_parts[part_index] || 0) - (second_parts[part_index] || 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function is_newer_app_release(release, app_info) {
  if (!release || typeof release.latest_version !== 'string') return false;
  const version_order = compare_app_versions(release.latest_version, app_info.version);
  if (version_order === null) return false;
  if (version_order !== 0) return version_order > 0;
  return typeof release.latest_build === 'string'
    && compare_app_versions(release.latest_build, app_info.build) === 1;
}

export function app_store_url(store_url, platform, app_id) {
  try {
    const parsed_url = new URL(store_url);
    if (parsed_url.protocol !== 'https:' || parsed_url.username || parsed_url.password || parsed_url.port) return null;
    if (platform === 'android' && parsed_url.hostname === 'play.google.com'
      && parsed_url.pathname === '/store/apps/details' && parsed_url.searchParams.get('id') === app_id) return parsed_url.href;
    if (platform === 'ios' && parsed_url.hostname === 'apps.apple.com'
      && /^\/(?:[a-z]{2}\/)?app\/(?:[^/]+\/)?id\d+\/?$/.test(parsed_url.pathname)) return parsed_url.href;
  } catch { /* Ignore invalid release metadata. */ }
  return null;
}

export function app_release_key(platform, release) {
  return `${platform}:${release.latest_version}:${release.latest_build || ''}`;
}

export function is_update_snoozed(snoozed_update, release_key, now = Date.now()) {
  return snoozed_update?.release_key === release_key
    && Number.isFinite(snoozed_update.until) && snoozed_update.until > now
    && snoozed_update.until <= now + update_snooze_ms;
}

export async function with_update_timeout(operation, timeout_ms = 5000) {
  let timeout_id;
  try {
    return await Promise.race([operation, new Promise((_resolve, reject) => {
      timeout_id = setTimeout(() => reject(new Error('App update operation timed out')), timeout_ms);
    })]);
  } finally {
    clearTimeout(timeout_id);
  }
}

export async function open_app_update(store_url, platform, app_id) {
  const validated_url = app_store_url(store_url, platform, app_id);
  if (!validated_url) throw new Error('Invalid app store URL');
  const result = await with_update_timeout(AppLauncher.openUrl({ url: validated_url }));
  if (!result.completed) throw new Error('App store could not be opened');
}
