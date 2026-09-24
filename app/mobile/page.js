// app/mobile/page.js
// Landing page for the phone-first staff app: big taps in for voice
// recording (consult / hospitalization), scanning a receipt straight into
// the accounting system, self-service scheduling, and the Messenger tab
// (app/mobile/messages) for replying to clients on the go. Dental Report/
// Surgery Report used to live here as their own tiles, opening a
// standalone "pick today's consult patient" picker — retired along with
// those tiles once the clinic confirmed a dental/surgery is now never
// done without a Day Procedure booking, making that whole consult-based
// path dead. app/mobile/dental/[id] and app/mobile/surgery/[id] (the
// actual dictation/recording pages) are still very much alive — that's
// what app/mobile/day-procedures/[id] routes into once a day procedure's
// own dental/surgical report is started — only their old standalone
// pickers (app/mobile/dental/page.js, app/mobile/surgery/page.js) are
// gone.
//
// Gated behind picking who you are first (remembered on this phone via
// localStorage — this app has no login system, same everywhere else in
// the mobile app — see MOBILE_STAFF_STORAGE_KEY). Nothing below is
// reachable until a name is picked, since staff identity feeds things
// like the hospitalization "Logged by" field and My Schedule.

'use client';

import { useEffect, useState } from 'react';
import MobileCleanerTabs from '@/app/_components/MobileCleanerTabs';
import CleanerLanguageToggle from '@/app/_components/CleanerLanguageToggle';
import { useCleanerLanguage } from '@/app/_components/useCleanerLanguage';
import { useHospitalizationUpdatePending } from '@/app/_components/useHospitalizationUpdatePending';
import { useClientMessagesPending } from '@/app/_components/useClientMessagesPending';
import { cageAlarmClass } from '@/lib/hospitalizationAttention';
import { t } from '@/lib/cleanerTranslations';

const MOBILE_STAFF_STORAGE_KEY = 'europets_mobile_staff_id';

// full_name commonly carries a "Dr." title (e.g. "Dr. Jim Bolssens") —
// strip it before taking the first name, so the greeting doesn't read
// "Hello, Dr.!".
function firstNameOf(fullName) {
  if (!fullName) return null;
  const withoutTitle = fullName.replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, '');
  return withoutTitle.split(' ')[0];
}

export default function MobileHomePage() {
  const [staffId, setStaffId] = useState(null);
  const [ready, setReady] = useState(false);
  const [staff, setStaff] = useState([]);
  const alarmLevel = useHospitalizationUpdatePending();
  const alarmClass = cageAlarmClass(alarmLevel);
  const dayProcedureAlarmLevel = useHospitalizationUpdatePending({ kind: 'day_procedure' });
  const dayProcedureAlarmClass = cageAlarmClass(dayProcedureAlarmLevel);
  const pendingMessageCount = useClientMessagesPending();
  const { language } = useCleanerLanguage();

  useEffect(() => {
    setStaffId(localStorage.getItem(MOBILE_STAFF_STORAGE_KEY));
    setReady(true);
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => setStaff(Array.isArray(data) ? data : []));
  }, []);

  function pickStaff(id) {
    localStorage.setItem(MOBILE_STAFF_STORAGE_KEY, id);
    setStaffId(id);
  }

  function switchStaff() {
    localStorage.removeItem(MOBILE_STAFF_STORAGE_KEY);
    setStaffId(null);
  }

  const me = staff.find((s) => s.id === staffId);
  const firstName = firstNameOf(me?.full_name);
  const isCleaner = me?.role === 'cleaner';
  const useSinhala = isCleaner && language === 'si';

  return (
    <div className="mobile-home">
      {!ready ? null : !staffId ? (
        <>
          <div className="mobile-heading-row">
            <a href="/" className="mobile-home-logo-link">
              <img src="/logo.png" alt="Europets Clinic" className="mobile-home-logo" />
            </a>
            <p className="mobile-subtitle mobile-whoareyou">Who are you?</p>
          </div>
          {staff.length === 0 ? (
            <p>No staff set up yet.</p>
          ) : (
            <ul className="mobile-list">
              {staff.map((s) => (
                <li key={s.id}>
                  <button type="button" className="mobile-list-item" onClick={() => pickStaff(s.id)}>
                    <span className="mobile-list-title">{s.full_name}</span>
                    <span className="mobile-list-meta">{s.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="mobile-heading-row">
            <a href="/" className="mobile-home-logo-link">
              <img src="/logo.png" alt="Europets Clinic" className="mobile-home-logo" />
            </a>
            <a href="/mobile/schedule" className="mobile-greeting" title="Go to your schedule">
              {t('Hello,', useSinhala)} {firstName || 'there'}!
            </a>
          </div>
          <button type="button" className="mobile-link-btn" onClick={switchStaff}>
            {t('Switch', useSinhala)}
          </button>

          {isCleaner ? (
            // A cleaner's whole job on this phone is these two things —
            // no Consults, Scan Receipt, or anything clinical/admin. The
            // language toggle sits right under them rather than up top,
            // since it's a once-in-a-while switch, not something to reach
            // for before the actual work tiles.
            <>
              <MobileCleanerTabs />
              <CleanerLanguageToggle />
            </>
          ) : (
            <div className="mobile-square-tiles">
              <a href="/mobile/consults" className="mobile-square-tile">
                <span className="mobile-square-tile-icon">🎙️</span>
                <span>Consults</span>
              </a>
              <a
                href="/mobile/hospitalization"
                className={`mobile-square-tile${alarmClass ? ` ${alarmClass}` : ''}`}
              >
                <span className="mobile-square-tile-icon">🏥</span>
                <span>Hospitalization{alarmLevel === 'red' || alarmLevel === 'both' ? ' 🩺' : alarmLevel === 'yellow' ? ' 🔔' : ''}</span>
              </a>
              <a
                href="/mobile/day-procedures"
                className={`mobile-square-tile${dayProcedureAlarmClass ? ` ${dayProcedureAlarmClass}` : ''}`}
              >
                <span className="mobile-square-tile-icon">📋</span>
                <span>
                  Day Procedures
                  {dayProcedureAlarmLevel === 'red' || dayProcedureAlarmLevel === 'both' ? ' 🩺' : dayProcedureAlarmLevel === 'yellow' ? ' 🔔' : ''}
                </span>
              </a>
              <a href="/mobile/schedule" className="mobile-square-tile">
                <span className="mobile-square-tile-icon">📅</span>
                <span>Schedule</span>
              </a>
              <a
                href="/mobile/messages"
                className={`mobile-square-tile${pendingMessageCount > 0 ? ' cage-update-requested' : ''}`}
              >
                <span className="mobile-square-tile-icon">💬</span>
                <span>Messages{pendingMessageCount > 0 ? ' 🔔' : ''}</span>
              </a>
              <a href="/mobile/scan-receipt" className="mobile-square-tile">
                <span className="mobile-square-tile-icon">🧾</span>
                <span>Scan Receipt</span>
              </a>
            </div>
          )}

          <p className="mobile-hint">
            Add this to your home screen for one-tap access: on iPhone, tap Share, then &quot;Add to
            Home Screen&quot;. On Android, tap the ⋮ menu, then &quot;Add to Home screen&quot; or
            &quot;Install app&quot;.
          </p>
        </>
      )}
    </div>
  );
}
