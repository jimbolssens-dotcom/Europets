// app/_components/MobileCleanerTabs.jsx
// Persistent 2-tab nav shown instead of the usual "← Record" back link on
// the pages a cleaner needs — Hospital (the cage layout) and Staff Roster
// (My Schedule). See app/mobile/page.js: picking a cleaner staff member
// lands on a simplified home with only these two tabs, and both
// destination pages show this same bar so a cleaner never has to go back
// through the tile-grid home to switch between them. Nothing else in the
// mobile app is reachable from here, by design.

'use client';

import { useHospitalizationUpdatePending } from '@/app/_components/useHospitalizationUpdatePending';

export default function MobileCleanerTabs({ active }) {
  const updatePending = useHospitalizationUpdatePending();

  return (
    <nav className="mobile-cleaner-tabs">
      <a
        href="/mobile/hospitalization"
        className={[
          'mobile-cleaner-tab',
          active === 'hospital' ? 'mobile-cleaner-tab-active' : '',
          updatePending ? 'cage-update-requested' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="mobile-cleaner-tab-icon">🏥</span>
        <span>Hospital{updatePending && ' 🔔'}</span>
      </a>
      <a
        href="/mobile/schedule"
        className={`mobile-cleaner-tab${active === 'roster' ? ' mobile-cleaner-tab-active' : ''}`}
      >
        <span className="mobile-cleaner-tab-icon">📅</span>
        <span>Staff Roster</span>
      </a>
    </nav>
  );
}
