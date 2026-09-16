// app/_components/MobileCleanerTabs.jsx
// The cleaner's actual home screen (app/mobile/page.js) — two big tap
// targets, Hospital (the cage layout) and Staff Roster (My Schedule),
// instead of the full staff tile grid. Everything past this point uses
// the same MobileHomeButton every other follow-through screen does to
// get back here, rather than this bar following the cleaner around.

'use client';

import { useHospitalizationUpdatePending } from '@/app/_components/useHospitalizationUpdatePending';
import { cageAlarmClass } from '@/lib/hospitalizationAttention';

export default function MobileCleanerTabs() {
  const alarmLevel = useHospitalizationUpdatePending();
  const alarmClass = cageAlarmClass(alarmLevel);

  return (
    <nav className="mobile-cleaner-tabs">
      <a href="/mobile/hospitalization" className={`mobile-cleaner-tab${alarmClass ? ` ${alarmClass}` : ''}`}>
        <span className="mobile-cleaner-tab-icon">🏥</span>
        <span>Hospital{alarmLevel === 'red' || alarmLevel === 'both' ? ' 🩺' : alarmLevel === 'yellow' ? ' 🔔' : ''}</span>
      </a>
      <a href="/mobile/schedule" className="mobile-cleaner-tab">
        <span className="mobile-cleaner-tab-icon">📅</span>
        <span>Staff Roster</span>
      </a>
    </nav>
  );
}
