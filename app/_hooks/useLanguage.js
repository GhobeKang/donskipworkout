'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { get_language, set_language, subscribe_language, translate, translate_message } from '../_lib/i18n';

const get_server_language = () => 'ko';

export function useLanguage() {
  const language = useSyncExternalStore(subscribe_language, get_language, get_server_language);
  const t = useCallback((message, parameters) => translate(message, parameters, language), [language]);
  const localize_message = useCallback((message) => translate_message(message, language), [language]);
  return { language, set_language, t, localize_message };
}
