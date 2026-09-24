// app/_components/CleanerLanguageToggle.jsx
// Two flag buttons — 🇬🇧 English / 🇱🇰 Sinhala — for a cleaner to switch the
// whole mobile interface's language on the spot. Only ever rendered on a
// cleaner's own screens (see app/mobile/page.js); the preference itself
// lives in useCleanerLanguage, read by every translated screen.

'use client';

import { useCleanerLanguage } from '@/app/_components/useCleanerLanguage';

export default function CleanerLanguageToggle() {
  const { language, setLanguage } = useCleanerLanguage();

  return (
    <div className="cleaner-language-toggle" role="group" aria-label="Language / භාෂාව">
      <button
        type="button"
        className={`cleaner-language-flag${language === 'en' ? ' active' : ''}`}
        onClick={() => setLanguage('en')}
        aria-label="English"
        aria-pressed={language === 'en'}
      >
        🇬🇧
      </button>
      <button
        type="button"
        className={`cleaner-language-flag${language === 'si' ? ' active' : ''}`}
        onClick={() => setLanguage('si')}
        aria-label="සිංහල"
        aria-pressed={language === 'si'}
      >
        🇱🇰
      </button>
    </div>
  );
}
