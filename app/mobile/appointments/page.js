// app/mobile/appointments/page.js
// Read-only daily appointment overview for the mobile app's "Schedule"
// tile (renamed from the old self-service roster tile — that's now
// reached by long-pressing your name on the home screen instead, see
// app/mobile/page.js). Just a look at what's booked today, swipeable to
// the next/previous day — no booking, editing, or check-in here, that
// all still happens from the desktop Appointments page.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import MobileHomeButton from '@/app/_components/MobileHomeButton';
import { formatTime, formatDayHeader } from '@/lib/formatTimestamp';
import { buildStaffColorMap, colorForAppointment, INACTIVE_APPOINTMENT_COLOR } from '@/lib/staffColors';

const TYPE_ICONS = { consult: '🩺', video: '🎥', surgery: '📋', meeting: '👥' };
const SWIPE_MIN_DISTANCE = 60;

function pad(n) {
  return String(n).padStart(2, '0');
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function shiftISODate(iso, delta) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

export default function MobileAppointmentsPage() {
  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()));
  const [appointments, setAppointments] = useState([]);
  const [vets, setVets] = useState([]);
  const [loading, setLoading] = useState(true);
  const swipeRef = useRef({ x: 0, y: 0, active: false });

  // Same per-doctor colors already shown on the desktop Appointments
  // schedule and Staff Roster (lib/staffColors.js) — a subtle left-border
  // accent here, not a full recolor, so it reads as "which doctor" at a
  // glance without competing with the list's own content.
  useEffect(() => {
    fetch('/api/staff?role=vet')
      .then((res) => res.json())
      .then((data) => setVets(Array.isArray(data) ? data : []));
  }, []);
  const vetColor = useMemo(() => buildStaffColorMap(vets), [vets]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(`/api/appointments?date=${selectedDate}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          setAppointments(Array.isArray(data) ? data : []);
          setLoading(false);
        });
    };
    setLoading(true);
    load();

    const channel = supabase
      .channel(`mobile-appointments-${selectedDate}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, load)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [selectedDate]);

  function onSwipeStart(e) {
    swipeRef.current = { x: e.clientX, y: e.clientY, active: true };
  }
  function onSwipeEnd(e) {
    if (!swipeRef.current.active) return;
    swipeRef.current.active = false;
    const dx = e.clientX - swipeRef.current.x;
    const dy = e.clientY - swipeRef.current.y;
    if (Math.abs(dx) > SWIPE_MIN_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setSelectedDate((d) => shiftISODate(d, dx < 0 ? 1 : -1));
    }
  }
  function onSwipeCancel() {
    swipeRef.current.active = false;
  }

  const isToday = selectedDate === toISODate(new Date());

  return (
    <div className="mobile-page">
      <MobileHomeButton />
      <h1>📅 Appointments</h1>

      <div className="mobile-week-nav">
        <button type="button" onClick={() => setSelectedDate((d) => shiftISODate(d, -1))}>
          &lsaquo;
        </button>
        <strong>{formatDayHeader(selectedDate)}</strong>
        <button type="button" onClick={() => setSelectedDate((d) => shiftISODate(d, 1))}>
          &rsaquo;
        </button>
      </div>
      {!isToday && (
        <button type="button" className="mobile-link-btn" onClick={() => setSelectedDate(toISODate(new Date()))}>
          Back to today
        </button>
      )}

      <div
        onPointerDown={onSwipeStart}
        onPointerUp={onSwipeEnd}
        onPointerCancel={onSwipeCancel}
        onPointerLeave={onSwipeCancel}
      >
        {loading ? (
          <p>Loading...</p>
        ) : appointments.length === 0 ? (
          <p className="mobile-hint">No appointments booked for this day.</p>
        ) : (
          <ul className="mobile-list">
            {appointments.map((a) => {
              const inactive = a.status === 'cancelled' || a.status === 'no_show';
              const borderColor = inactive
                ? INACTIVE_APPOINTMENT_COLOR.fg
                : colorForAppointment(vetColor, a.vet_id, a.type).fg;
              return (
                <li key={a.id}>
                  <div
                    className={`mobile-list-item mobile-appt-dr-accent${inactive ? ' mobile-appt-inactive' : ''}`}
                    style={{ borderLeftColor: borderColor }}
                  >
                    <span className="mobile-list-title">
                      {formatTime(a.start_time)} · {TYPE_ICONS[a.type] || ''}{' '}
                      {a.type === 'meeting' ? a.reason || 'Staff Meeting' : a.patients?.name || '(unlinked)'}
                      {inactive ? ` · ${a.status === 'no_show' ? 'No-show' : 'Cancelled'}` : ''}
                    </span>
                    <span className="mobile-list-meta">
                      {a.type !== 'meeting' && a.clients?.full_name}
                      {a.rooms?.name ? ` · ${a.rooms.name}` : ''}
                      {a.staff?.full_name ? ` · ${a.staff.full_name}` : ''}
                      {a.reason && a.type !== 'meeting' ? ` · ${a.reason}` : ''}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
