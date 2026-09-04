// app/mobile/page.js
// Landing page for the phone-first staff app: big taps in for voice
// recording (consult / hospitalization), scanning a receipt straight into
// the accounting system, and self-service scheduling.
//
// Gated behind picking who you are first (remembered on this phone via
// localStorage — this app has no login system, same everywhere else in
// the mobile app — see MOBILE_STAFF_STORAGE_KEY). Nothing below is
// reachable until a name is picked, since staff identity feeds things
// like the hospitalization "Logged by" field and My Schedule.

'use client';

import { useEffect, useState } from 'react';
import MobileCleanerTabs from '@/app/_components/MobileCleanerTabs';

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
            <h1 className="mobile-greeting">Hello, {firstName || 'there'}!</h1>
          </div>
          <button type="button" className="mobile-link-btn" onClick={switchStaff}>
            Not you? Switch
          </button>

          {me?.role === 'cleaner' ? (
            // A cleaner's whole job on this phone is these two things —
            // no Consults, Scan Receipt, or anything clinical/admin.
            <MobileCleanerTabs />
          ) : (
            <>
              <a href="/mobile/consults" className="mobile-tile mobile-tile-first">
                <span className="mobile-tile-icon">🎙️</span>
                <span>Consults</span>
                <span className="mobile-tile-hint">Today's appointments — tap a patient to record</span>
              </a>
              <a href="/mobile/hospitalization" className="mobile-tile">
                <span className="mobile-tile-icon">🏥</span>
                <span>Hospitalization</span>
                <span className="mobile-tile-hint">Admitted patients — tap one to record an observation</span>
              </a>
              <a href="/mobile/scan-receipt" className="mobile-tile">
                <span className="mobile-tile-icon">🧾</span>
                <span>Scan Receipt</span>
                <span className="mobile-tile-hint">Photograph a supplier receipt to log it as an expense</span>
              </a>
              <a href="/mobile/schedule" className="mobile-tile">
                <span className="mobile-tile-icon">📅</span>
                <span>My Schedule</span>
                <span className="mobile-tile-hint">Add or remove yourself from this week's mornings/afternoons</span>
              </a>
            </>
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
