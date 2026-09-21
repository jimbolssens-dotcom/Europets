// app/_components/MobileCleanerTabs.jsx
// The cleaner's actual home screen (app/mobile/page.js) — two big tap
// targets, Hospital (the cage layout) and Staff Roster (My Schedule),
// instead of the full staff tile grid. Everything past this point uses
// the same MobileHomeButton every other follow-through screen does to
// get back here, rather than this bar following the cleaner around.

'use client';

import { useHospitalizationUpdatePending } from '@/app/_components/useHospitalizationUpdatePending';
import { cageAlarmClass } from '@/lib/hospitalizationAttention';
import { t } from '@/lib/cleanerTranslations';

export default function MobileCleanerTabs() {
  const alarmLevel = useHospitalizationUpdatePending();
  const alarmClass = cageAlarmClass(alarmLevel);

  // This component only ever renders for a cleaner (see app/mobile/page.js),
  // so t()'s second argument is always true here — no isCleaner to thread
  // through.
  return (
    <nav className="mobile-cleaner-tabs">
      <a href="/mobile/hospitalization" className={`mobile-cleaner-tab${alarmClass ? ` ${alarmClass}` : ''}`}>
        <span className="mobile-cleaner-tab-icon">🏥</span>
        <span>{t('Hospital', true)}{alarmLevel === 'red' || alarmLevel === 'both' ? ' 🩺' : alarmLevel === 'yellow' ? ' 🔔' : ''}</span>
      </a>
      <a href="/mobile/schedule" className="mobile-cleaner-tab">
        <span className="mobile-cleaner-tab-icon">📅</span>
        <span>{t('Staff Roster', true)}</span>
      </a>
    </nav>
  );
}
