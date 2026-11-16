import { useEffect, useState } from 'react';
import { api_request } from '../_lib/api';

export default function useFirstUseGuide({ user_uuid, has_completed_checkin, on_unauthorized }) {
  const storage_key = `donskipworkout.first-use.v1.${user_uuid}`;
  const [guide_preference, set_guide_preference] = useState(null);
  const remember_dismissal = () => {
    set_guide_preference({ storage_key, dismissed: true });
    try { localStorage.setItem(storage_key, 'dismissed'); }
    catch (error) { console.error('[FIRST_USE_GUIDE_SAVE_ERROR]', error.name); }
  };

  useEffect(() => {
    const controller = new AbortController();
    let dismissed = has_completed_checkin;
    try { dismissed ||= localStorage.getItem(storage_key) === 'dismissed'; }
    catch (error) { console.error('[FIRST_USE_GUIDE_READ_ERROR]', error.name); }
    if (dismissed) {
      set_guide_preference({ storage_key, dismissed: true });
      try { localStorage.setItem(storage_key, 'dismissed'); }
      catch (error) { console.error('[FIRST_USE_GUIDE_SAVE_ERROR]', error.name); }
      return undefined;
    }
    // Existing users may have older check-ins even when record reuse is disabled.
    api_request('/stats', { signal: controller.signal }).then((stats) => {
      if (controller.signal.aborted) return;
      const has_past_checkins = stats.completed_count > 0;
      set_guide_preference({ storage_key, dismissed: has_past_checkins });
      if (has_past_checkins) {
        try { localStorage.setItem(storage_key, 'dismissed'); }
        catch (error) { console.error('[FIRST_USE_GUIDE_SAVE_ERROR]', error.name); }
      }
    }).catch((error) => {
      if (controller.signal.aborted) return;
      if (error.status === 401) on_unauthorized();
      else {
        console.error('[FIRST_USE_GUIDE_HISTORY_ERROR]', error.name);
        set_guide_preference({ storage_key, dismissed: false });
      }
    });
    return () => controller.abort();
  }, [storage_key, has_completed_checkin, on_unauthorized]);

  return {
    is_visible: !has_completed_checkin && guide_preference?.storage_key === storage_key && !guide_preference.dismissed,
    dismiss_guide: remember_dismissal,
  };
}
