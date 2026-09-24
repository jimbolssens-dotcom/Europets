// app/_components/useCleanerLanguage.js
// A cleaner's chosen language for the mobile app's Sinhala translations
// (see lib/cleanerTranslations.js) — remembered per phone via localStorage,
// same pattern as useMobileStaff's own staff-id memory. Defaults to Sinhala
// ('si') so existing behavior is unchanged for anyone who's never touched
// the toggle; only a cleaner who explicitly picks the English flag gets
// 'en'. Every non-cleaner screen ignores this entirely — see each call
// site's own isCleaner && language === 'si' check.

import { useEffect, useState } from 'react';

export const CLEANER_LANGUAGE_STORAGE_KEY = 'europets_mobile_language';

export function useCleanerLanguage() {
  const [language, setLanguageState] = useState('si');

  useEffect(() => {
    setLanguageState(localStorage.getItem(CLEANER_LANGUAGE_STORAGE_KEY) || 'si');
  }, []);

  function setLanguage(lang) {
    localStorage.setItem(CLEANER_LANGUAGE_STORAGE_KEY, lang);
    setLanguageState(lang);
  }

  return { language, setLanguage };
}
