'use client';

import { useEffect, useMemo, useState } from 'react';
import { api_request } from '../_lib/api';
import { localize_data } from '../_lib/i18n';
import { useLanguage } from './useLanguage';

export default function useApiResource(path, revision, on_unauthorized) {
  const { language, localize_message } = useLanguage();
  const [resource, set_resource] = useState({
    path: null, data: null, loading: true, error: '', loaded_revision: null,
  });
  const localized_data = useMemo(() => localize_data(resource.data, language), [resource.data, language]);
  useEffect(() => {
    const controller = new AbortController();
    set_resource((current) => ({
      path,
      data: current.path === path ? current.data : null,
      loading: true,
      error: '',
      loaded_revision: current.path === path ? current.loaded_revision : null,
    }));
    api_request(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          set_resource({ path, data, loading: false, error: '', loaded_revision: revision });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) on_unauthorized();
        set_resource((current) => ({ ...current, loading: false, error: error.message }));
      });
    return () => controller.abort();
  }, [path, revision, on_unauthorized]);
  return resource.path === path ? { ...resource, data: localized_data, error: localize_message(resource.error) } : { path, data: null, loading: true, error: '' };
}
