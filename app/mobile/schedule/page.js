// app/mobile/schedule/page.js
// Self-service "My Schedule": pick yourself once (remembered on this
// phone via localStorage — this app has no login system, same as
// everywhere else), then add or remove yourself from any morning/
// afternoon this week with a tap. Writes to the same staff_roster_entries
// table as the admin Staff Roster page (app/(admin)/staff/roster), so
// changes show up there immediately and vice versa.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import MobileHomeButton from '@/app/_components/MobileHomeButton';

const STORAGE_KEY = 'europets_mobile_staff_id';
const SHIFTS = ['morning', 'afternoon'];
const SHIFT_LABELS = { morning: 'Morning', afternoon: 'Afternoon' };

function pad(n) {
  return String(n).padStart(2, '0');
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function mondayOf(d) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export default function MobileSchedulePage() {
  const [staffId, setStaffId] = useState(null);
  const [ready, setReady] = useState(false);
  const [staff, setStaff] = useState([]);
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [error, setError] = useState(null);
  const [repeating, setRepeating] = useState(false);
  const [repeatMessage, setRepeatMessage] = useState(null);

  useEffect(() => {
    setStaffId(localStorage.getItem(STORAGE_KEY));
    setReady(true);
  }, []);

  useEffect(() => {
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => setStaff(Array.isArray(data) ? data : []));
  }, []);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekStartISO = toISODate(weekDates[0]);
  const weekEndISO = toISODate(weekDates[6]);

  const loadEntries = () => {
    if (!staffId) return;
    setLoadingEntries(true);
    fetch(`/api/staff-roster?start=${weekStartISO}&end=${weekEndISO}&staff_id=${staffId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'Failed to load your schedule');
        setError(null);
        setEntries(Array.isArray(data) ? data : []);
        setLoadingEntries(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoadingEntries(false);
      });
  };

  useEffect(() => {
    if (!staffId) return;
    loadEntries();

    const channel = supabase
      .channel(`mobile-schedule-${staffId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_roster_entries', filter: `staff_id=eq.${staffId}` },
        () => loadEntries()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId, weekStartISO, weekEndISO]);

  function pickStaff(id) {
    localStorage.setItem(STORAGE_KEY, id);
    setStaffId(id);
  }

  function switchStaff() {
    localStorage.removeItem(STORAGE_KEY);
    setStaffId(null);
    setEntries([]);
  }

  async function toggleShift(dateISO, shift) {
    setError(null);
    const existing = entries.find((e) => e.date === dateISO && e.shift === shift);
    try {
      const res = existing
        ? await fetch(`/api/staff-roster/${existing.id}`, { method: 'DELETE' })
        : await fetch('/api/staff-roster', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staff_id: staffId, date: dateISO, shift }),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to update your schedule');
        return;
      }
    } catch (err) {
      setError(err.message || 'Failed to update your schedule');
      return;
    }
    loadEntries();
  }

  async function repeatLastWeek() {
    setError(null);
    setRepeatMessage(null);
    setRepeating(true);
    try {
      const res = await fetch('/api/staff-roster/repeat-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staffId, week_start: weekStartISO }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Failed to repeat last week');
        return;
      }
      setRepeatMessage(
        data.copied > 0
          ? `Added ${data.copied} shift${data.copied === 1 ? '' : 's'} from last week.`
          : 'No shifts last week to repeat.'
      );
      loadEntries();
    } catch (err) {
      setError(err.message || 'Failed to repeat last week');
    } finally {
      setRepeating(false);
    }
  }

  const me = staff.find((s) => s.id === staffId);
  const weekLabel = `${weekDates[0].toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${weekDates[6].toLocaleDateString([], { month: 'short', day: 'numeric' })}`;

  if (!ready) return null;

  return (
    <div className="mobile-page">
      <MobileHomeButton />
      <h1>My Schedule</h1>
      {error && <p className="error">{error}</p>}

      {!staffId ? (
        <>
          <p className="mobile-subtitle">Who are you?</p>
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
          <p className="mobile-subtitle">
            {me?.full_name || 'You'} ·{' '}
            <button type="button" className="mobile-link-btn" onClick={switchStaff}>
              Not you? Switch
            </button>
          </p>

          <div className="mobile-week-nav">
            <button
              type="button"
              onClick={() => {
                setWeekStart(addDays(weekStart, -7));
                setRepeatMessage(null);
              }}
            >
              &lsaquo;
            </button>
            <strong>{weekLabel}</strong>
            <button
              type="button"
              onClick={() => {
                setWeekStart(addDays(weekStart, 7));
                setRepeatMessage(null);
              }}
            >
              &rsaquo;
            </button>
          </div>

          <button
            type="button"
            className="mobile-repeat-week-btn"
            onClick={repeatLastWeek}
            disabled={repeating || loadingEntries}
          >
            {repeating ? 'Repeating...' : '🔁 Repeat Last Week'}
          </button>
          {repeatMessage && <p className="mobile-subtitle">{repeatMessage}</p>}

          {loadingEntries ? (
            <p>Loading...</p>
          ) : (
            <ul className="mobile-schedule-days">
              {weekDates.map((d) => {
                const iso = toISODate(d);
                return (
                  <li key={iso} className="mobile-schedule-day">
                    <div className="mobile-schedule-day-label">
                      {d.toLocaleDateString([], { weekday: 'long' })}
                      <span className="mobile-list-meta"> {d.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div className="mobile-schedule-shifts">
                      {SHIFTS.map((shift) => {
                        const on = entries.some((e) => e.date === iso && e.shift === shift);
                        return (
                          <button
                            key={shift}
                            type="button"
                            className={`mobile-shift-btn${on ? ' mobile-shift-btn-on' : ''}`}
                            onClick={() => toggleShift(iso, shift)}
                          >
                            {SHIFT_LABELS[shift]} {on ? '✓' : ''}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
