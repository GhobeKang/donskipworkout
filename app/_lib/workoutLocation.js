import { registerPlugin } from '@capacitor/core';

export const WorkoutLocation = registerPlugin('WorkoutLocation');

export const workout_arrival_source = 'workout_location';
export const workout_arrival_action = 'start_workout';

export function pending_arrival_key(user_uuid) {
  return 'workout_arrival_pending_' + user_uuid;
}

