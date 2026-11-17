import { useCallback, useEffect, useRef, useState } from 'react';
import { api_request } from '../_lib/api';

export default function useOnboarding({ on_unauthorized }) {
  const [data, set_data] = useState(null);
  const [loading, set_loading] = useState(true);
  const [pending, set_pending] = useState(false);
  const [error, set_error] = useState('');
  const [revision, set_revision] = useState(0);
  const mutation_controller = useRef(null);
  const current_data = useRef(null);
  const reload = useCallback(() => set_revision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    set_loading(true);
    set_error('');
    api_request('/onboarding', { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      current_data.current = result;
      set_data(result);
    }).catch((request_error) => {
      if (controller.signal.aborted) return;
      if (request_error.status === 401) on_unauthorized();
      else set_error(request_error.message);
    }).finally(() => { if (!controller.signal.aborted) set_loading(false); });
    return () => controller.abort();
  }, [revision, on_unauthorized]);
  useEffect(() => () => mutation_controller.current?.abort(), []);

  const save_progress = async (draft, current_step, status = 'in_progress', complete = false) => {
    if (mutation_controller.current || !current_data.current) return false;
    const controller = new AbortController();
    mutation_controller.current = controller;
    set_pending(true);
    set_error('');
    try {
      const result = await api_request(complete ? '/onboarding/complete' : '/onboarding', {
        method: complete ? 'POST' : 'PUT',
        body: { draft, current_step, status, revision: current_data.current.revision },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return false;
      current_data.current = result;
      set_data(result);
      return result;
    } catch (request_error) {
      if (controller.signal.aborted) return false;
      if (request_error.status === 401) on_unauthorized();
      else set_error(request_error.message);
      return false;
    } finally {
      mutation_controller.current = null;
      if (!controller.signal.aborted) set_pending(false);
    }
  };
  return { data, loading, pending, error, reload, reload_revision: revision, save_progress };
}
