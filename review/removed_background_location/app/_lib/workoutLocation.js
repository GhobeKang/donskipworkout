import { registerPlugin } from '@capacitor/core';

export const WorkoutLocation = registerPlugin('WorkoutLocation');

export const workout_arrival_source = 'workout_location';
export const workout_arrival_action = 'start_workout';

export function pending_arrival_key(user_uuid) {
  return 'workout_arrival_pending_' + user_uuid;
}

export function pending_departure_key(user_uuid) {
  return 'workout_departure_pending_' + user_uuid;
}

export async function location_request(request) {
  let timeout_id;
  try {
    return await Promise.race([
      request,
      new Promise((_, reject) => {
        timeout_id = setTimeout(() => reject(new Error('위치 확인 시간이 초과되었습니다.')), 12000);
      }),
    ]);
  } finally {
    clearTimeout(timeout_id);
  }
}

export function is_outside_workout_place(place, position) {
  if (![place.latitude, place.longitude, position.latitude, position.longitude, position.accuracy]
    .every(Number.isFinite) || position.accuracy < 0 || position.accuracy > 150) return false;
  const radians = Math.PI / 180;
  const latitude_delta = (position.latitude - place.latitude) * radians;
  const longitude_delta = (position.longitude - place.longitude) * radians;
  const distance_fraction = Math.sin(latitude_delta / 2) ** 2
    + Math.cos(place.latitude * radians) * Math.cos(position.latitude * radians)
    * Math.sin(longitude_delta / 2) ** 2;
  const distance_meters = 6371000 * 2 * Math.asin(Math.sqrt(Math.min(distance_fraction, 1)));
  // The complete accuracy circle must be outside, so GPS drift does not end a workout.
  return distance_meters - position.accuracy > 150;
}

export function apply_pending_departure(timer, departure) {
  if (!timer || !departure || timer.timer_uuid !== departure.timer_uuid) return timer;
  if (timer.location_finish_pending) return timer;
  const expired_timer = timer.status === 'needs_review'
    && timer.needs_review_reason === '종료 시각을 확인해 주세요.'
    && timer.revision === departure.expected_revision + 1;
  if (!expired_timer && (timer.revision !== departure.expected_revision
    || !['running', 'paused'].includes(timer.status))) return timer;
  const exited_at = Date.parse(departure.client_action_at);
  const segment_started_at = Date.parse(timer.active_segment_started_at);
  if (!Number.isFinite(exited_at) || (timer.status !== 'paused' && !Number.isFinite(segment_started_at))) return timer;
  const segment_seconds = timer.status === 'paused' ? 0 : Math.max(0, Math.floor((exited_at - segment_started_at) / 1000));
  return {
    ...timer,
    status: 'finished',
    finished_at: new Date(exited_at).toISOString(),
    needs_review_reason: null,
    active_segment_started_at: null,
    measured_seconds: timer.measured_seconds + segment_seconds,
    location_pause_pending: false,
    location_finish_pending: true,
  };
}

