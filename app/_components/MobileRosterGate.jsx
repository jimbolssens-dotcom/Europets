// app/_components/MobileRosterGate.jsx
// Blocks the entire mobile app behind a full-screen, non-dismissable
// prompt whenever the staff member picked on this phone hasn't logged
// ANY shift for next week yet — the one exception is My Schedule itself
// (app/mobile/schedule), which stays reachable so there's actually a way
// out. Mandatory by default: no "remind me later", no skip — except the
// one deliberate bypass below.
//
// "Next week" is always the calendar week (Mon-Sun) after the one
// containing today, recomputed fresh on every check rather than pinned —
// crossing a Monday while the app is already open naturally rolls the
// check onto the new "next week" without needing a page reload.
//
// An empty roster can mean either "hasn't logged it yet" or "genuinely
// has nothing on next week" (approved leave, no shifts at all that week)
// — those look identical in staff_roster_entries alone, so "No shifts
// this week" records an explicit confirmation instead
// (staff_roster_no_shift_confirmations, migration 143) that clears the
// gate the same way an actual logged shift would, scoped to that one
// week — the week after rolls the requirement forward again regardless.

'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

const MOBILE_STAFF_STORAGE_KEY = 'europets_mobile_staff_id';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nextWeekRange() {
  const today = new Date();
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() + diffToMonday);
  thisMonday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(thisMonday.getDate() + 7);
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);
  return { start: toISODate(nextMonday), end: toISODate(nextSunday) };
}

export default function MobileRosterGate() {
  const pathname = usePathname();
  const [staffId, setStaffId] = useState(null);
  const [hasNextWeekEntry, setHasNextWeekEntry] = useState(true); // true (not blocked) until proven otherwise
  const [confirmedNoShift, setConfirmedNoShift] = useState(false);
  const [checked, setChecked] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState(null);

  // This component lives in the persistent mobile layout, so it mounts
  // once for the whole session — picking a name on app/mobile/page.js
  // writes localStorage without any navigation happening (same route,
  // just a state change), so a pathname-triggered re-read would miss it
  // until the next tap took them somewhere else. A short poll catches
  // that same-tab write immediately instead of relying on one.
  useEffect(() => {
    let current = localStorage.getItem(MOBILE_STAFF_STORAGE_KEY);
    setStaffId(current);
    const poll = window.setInterval(() => {
      const latest = localStorage.getItem(MOBILE_STAFF_STORAGE_KEY);
      if (latest !== current) {
        current = latest;
        setStaffId(latest);
      }
    }, 1000);
    return () => window.clearInterval(poll);
  }, []);

  useEffect(() => {
    if (!staffId) {
      setChecked(true);
      return;
    }
    const { start, end } = nextWeekRange();
    const load = () =>
      Promise.all([
        fetch(`/api/staff-roster?start=${start}&end=${end}&staff_id=${staffId}`).then((res) => (res.ok ? res.json() : [])),
        fetch(`/api/staff-roster/no-shift-confirmation?staff_id=${staffId}&week_start=${start}`).then((res) =>
          res.ok ? res.json() : { confirmed: false }
        ),
      ])
        .then(([entries, confirmation]) => {
          setHasNextWeekEntry(Array.isArray(entries) && entries.length > 0);
          setConfirmedNoShift(Boolean(confirmation?.confirmed));
          setChecked(true);
        })
        .catch(() => setChecked(true)); // don't block the whole app over a network hiccup

    load();
    const channel = supabase
      .channel(`mobile-roster-gate-${staffId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_roster_entries', filter: `staff_id=eq.${staffId}` },
        load
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_roster_no_shift_confirmations', filter: `staff_id=eq.${staffId}` },
        load
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [staffId]);

  async function confirmNoShift() {
    setConfirming(true);
    setConfirmError(null);
    const { start } = nextWeekRange();
    try {
      const res = await fetch('/api/staff-roster/no-shift-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staffId, week_start: start }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setConfirmError(data.error || 'Failed to confirm');
        return;
      }
      setConfirmedNoShift(true);
    } catch (err) {
      setConfirmError(err.message || 'Failed to confirm');
    } finally {
      setConfirming(false);
    }
  }

  const onSchedulePage = pathname === '/mobile/schedule';
  const blocked = checked && staffId && !hasNextWeekEntry && !confirmedNoShift && !onSchedulePage;

  if (!blocked) return null;

  return (
    <div className="mobile-roster-gate">
      <div className="mobile-roster-gate-card">
        <span className="mobile-roster-gate-icon">📅</span>
        <h2>Log next week's roster</h2>
        <p>You haven't added any shifts for next week yet — this has to be done before you can use the app.</p>
        {confirmError && <p className="error">{confirmError}</p>}
        <a href="/mobile/schedule" className="mobile-roster-gate-btn">
          Go to My Schedule
        </a>
        <button type="button" className="mobile-roster-gate-bypass" onClick={confirmNoShift} disabled={confirming}>
          {confirming ? 'Confirming...' : "I have no shifts next week"}
        </button>
      </div>
    </div>
  );
}
