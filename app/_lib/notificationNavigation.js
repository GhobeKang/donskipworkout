const uuid_pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function notification_destination(notification) {
  if (!notification || !uuid_pattern.test(notification.notification_uuid || '')) return null;
  if (['mentor_message', 'mentor_research_edit'].includes(notification.category)) {
    if (!uuid_pattern.test(notification.relationship_uuid || '')) return null;
    if (notification.target === 'own_research') {
      if (!['custom', 'shared'].includes(notification.exercise_source)
          || !Number.isSafeInteger(notification.exercise_id) || notification.exercise_id < 1) return null;
      return { view: 'workout', research: { ...notification, name: notification.exercise_name || '연구일지' } };
    }
    if (!['messages', 'research'].includes(notification.target)) return null;
    return { view: 'mentorship', coaching: notification };
  }
  if (uuid_pattern.test(notification.room_uuid || '')) {
    return { view: 'challenge', room_uuid: notification.room_uuid };
  }
  if (notification.category === 'workout_reminder') return { view: 'today' };
  if (notification.category === 'push_test') return { view: 'settings' };
  return null;
}
