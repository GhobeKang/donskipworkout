import { useEffect, useRef, useState } from 'react';
import { api_request } from '../_lib/api';
import { useLanguage } from './useLanguage';

export default function useMentorshipAction(on_unauthorized) {
  const { localize_message } = useLanguage();
  const [pending, set_pending] = useState(false);
  const [error, set_error] = useState('');
  const request_ref = useRef(null);
  const attempts_ref = useRef({ key: '', failures: 0 });
  useEffect(() => () => request_ref.current?.abort(), []);
  const run = async (path, method, body) => {
    if (request_ref.current) return null;
    const request_key = JSON.stringify([path, method, body]);
    if (attempts_ref.current.key !== request_key) attempts_ref.current = { key: request_key, failures: 0 };
    if (attempts_ref.current.failures >= 3) {
      set_error(localize_message('재시도 횟수를 초과했습니다. 화면을 다시 열어 주세요.'));
      return null;
    }
    const controller = new AbortController();
    request_ref.current = controller;
    set_pending(true);
    set_error('');
    try {
      const result = await api_request(path, { method, body, signal: controller.signal });
      if (controller.signal.aborted) return null;
      attempts_ref.current.failures = 0;
      if (method === 'DELETE') window.dispatchEvent(new Event('coaching-notifications-refresh'));
      return result;
    } catch (request_error) {
      if (controller.signal.aborted) return null;
      attempts_ref.current.failures += 1;
      if (request_error.status === 401) on_unauthorized();
      set_error(localize_message(request_error.message));
      return null;
    } finally {
      if (request_ref.current === controller) request_ref.current = null;
      if (!controller.signal.aborted) set_pending(false);
    }
  };
  return { run, pending, error };
}
