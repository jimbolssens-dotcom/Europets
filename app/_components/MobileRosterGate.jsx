// app/_components/MobileRosterGate.jsx
// Blocks the entire mobile app behind a full-screen, non-dismissable
// prompt whenever the staff member picked on this phone hasn't logged
// ANY shift for next week yet — the one exception is My Schedule itself
// (app/mobile/schedule), which stays reachable so there's actually a way
// out. Mandatory by explicit request: no "remind me later", no skip.
//
// "Next week" is always the calendar week (Mon-Sun) after the one
// containing today, recomputed fresh on every check rather than pinned —
// crossing a Monday while the app is already open naturally rolls the
// check onto the new "next week" without needing a page reload.
//
// Deliberately does NOT distinguish "genuinely has no shifts next week"
// (approved leave, day off every day) from "just hasn't logged it yet" —
// there's no way to tell those apart from an empty roster alone, and the
// request was explicit: non-negotiable, no bypass. Worth knowing if it
// ever blocks someone who really has nothing to log.

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
  const [checked, setChecked] = useState(false);

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
      fetch(`/api/staff-roster?start=${start}&end=${end}&staff_id=${staffId}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          setHasNextWeekEntry(Array.isArray(data) && data.length > 0);
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
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [staffId]);

  const onSchedulePage = pathname === '/mobile/schedule';
  const blocked = checked && staffId && !hasNextWeekEntry && !onSchedulePage;

  if (!blocked) return null;

  return (
    <div className="mobile-roster-gate">
      <div className="mobile-roster-gate-card">
        <span className="mobile-roster-gate-icon">📅</span>
        <h2>Log next week's roster</h2>
        <p>You haven't added any shifts for next week yet — this has to be done before you can use the app.</p>
        <a href="/mobile/schedule" className="mobile-roster-gate-btn">
          Go to My Schedule
        </a>
      </div>
    </div>
  );
}
