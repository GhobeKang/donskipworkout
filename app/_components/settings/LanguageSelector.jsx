'use client';

import { useState } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';

export default function LanguageSelector() {
  const { language, set_language, t } = useLanguage();
  const [storage_failed, set_storage_failed] = useState(false);
  return <div className="languageSetting">
    <label className="fieldLabel" htmlFor="app-language">{language === 'en' ? 'Language' : '언어 / Language'}</label>
    <select className="timeInput" id="app-language" value={language} onChange={(event) => set_storage_failed(!set_language(event.target.value))}>
      <option value="ko" lang="ko">한국어</option>
      <option value="en" lang="en">English</option>
    </select>
  </div>;
}
