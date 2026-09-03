// app/appointments/page.jsx
// Month calendar overview + an Outlook-style day schedule: one column per
// room, continuous time down the side, appointments as colored blocks
// positioned by their actual start time/duration and color-coded by vet.
// Click empty grid space to pick a room + time for a new booking.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import SearchSelect from '@/app/_components/SearchSelect';

const OPEN_HOUR = 8;
const CLOSE_HOUR = 19;
const PIXELS_PER_MINUTE = 1.4;
const SNAP_MINUTES = 15;
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const VET_PALETTE = [
  { bg: '#dbeafe', fg: '#1d4ed8' },
  { bg: '#dcfce7', fg: '#15803d' },
  { bg: '#fef3c7', fg: '#b45309' },
  { bg: '#ede9fe', fg: '#6d28d9' },
  { bg: '#cffafe', fg: '#0e7490' },
  { bg: '#ffe4e6', fg: '#be123c' },
  { bg: '#ecfccb', fg: '#4d7c0f' },
  { bg: '#fae8ff', fg: '#a21caf' },
];
const UNASSIGNED_COLOR = { bg: '#f3f4f6', fg: '#4b5563' };

function pad(n) {
  return String(n).padStart(2, '0');
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toMonthKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function todayISODate() {
  return toISODate(new Date());
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function minutesSinceOpen(iso) {
  const d = new Date(iso);
  return (d.getHours() - OPEN_HOUR) * 60 + d.getMinutes();
}

// A 6-row Sun-start grid of Date objects covering the given month, padded
// with the trailing days of the previous/next month, for the always-visible
// mini calendar (no popup — the whole point is not needing to click an icon).
function buildMonthGrid(year, monthIndex) {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, monthIndex, 1 - startOffset);

  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

function buildHourMarks() {
  const marks = [];
  for (let h = OPEN_HOUR; h <= CLOSE_HOUR; h++) {
    marks.push(h);
  }
  return marks;
}
const HOUR_MARKS = buildHourMarks();

// 15-minute gridlines within each hour (the hour marks above already cover
// the :00 lines), so the schedule reads in clear quarter-hour brackets.
function buildQuarterMarks() {
  const marks = [];
  const totalMinutes = (CLOSE_HOUR - OPEN_HOUR) * 60;
  for (let m = SNAP_MINUTES; m < totalMinutes; m += SNAP_MINUTES) {
    if (m % 60 !== 0) marks.push(m);
  }
  return marks;
}
const QUARTER_MARKS = buildQuarterMarks();

const SCHEDULE_HEIGHT = (CLOSE_HOUR - OPEN_HOUR) * 60 * PIXELS_PER_MINUTE;
const TIME_COL_WIDTH = 64; // matches .schedule-time-col's flex-basis
const ROOM_COL_WIDTH = 130; // matches .schedule-room-col's flex-basis

// Time (as a 12-hour label, e.g. "2:15 PM") for a snapped "HH:MM" 24-hour string.
function formatSlotLabel(time24) {
  const [h, m] = time24.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const emptyForm = {
  client_id: '',
  patient_id: '',
  room_id: '',
  vet_id: '',
  type: 'consult',
  time: '',
  duration_minutes: '10',
  reason: '',
};

export default function AppointmentsPage() {
  const router = useRouter();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonthIndex, setViewMonthIndex] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayISODate());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [patients, setPatients] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [vets, setVets] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [hoverSlot, setHoverSlot] = useState(null);
  const [openingConsultId, setOpeningConsultId] = useState(null);
  const [scheduleWarning, setScheduleWarning] = useState(null); // { message, payload } while showing "book anyway"
  const bookingFormRef = useRef(null);

  const monthKey = toMonthKey(new Date(viewYear, viewMonthIndex, 1));

  const loadMonth = () =>
    fetch(`/api/appointments?month=${monthKey}`)
      .then((res) => res.json())
      .then((data) => {
        setAppointments(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    setLoading(true);
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  useEffect(() => {
    Promise.all([
      fetch('/api/clients').then((res) => res.json()),
      fetch('/api/patients').then((res) => res.json()),
      fetch('/api/rooms').then((res) => res.json()),
      fetch('/api/staff?role=vet').then((res) => res.json()),
    ]).then(([clientsData, patientsData, roomsData, vetsData]) => {
      setClients(Array.isArray(clientsData) ? clientsData : []);
      setPatients(Array.isArray(patientsData) ? patientsData : []);
      setRooms(Array.isArray(roomsData) ? roomsData : []);
      setVets(Array.isArray(vetsData) ? vetsData : []);
    });

    const channel = supabase
      .channel('appointments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () =>
        loadMonth()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vetColor = useMemo(() => {
    const map = {};
    vets.forEach((v, i) => {
      map[v.id] = VET_PALETTE[i % VET_PALETTE.length];
    });
    return map;
  }, [vets]);

  const colorForVet = (vetId) => (vetId && vetColor[vetId]) || UNASSIGNED_COLOR;

  const countsByDate = useMemo(() => {
    const counts = {};
    for (const a of appointments) {
      if (a.status === 'cancelled') continue;
      const d = toISODate(new Date(a.start_time));
      counts[d] = (counts[d] || 0) + 1;
    }
    return counts;
  }, [appointments]);

  const monthGrid = useMemo(() => buildMonthGrid(viewYear, viewMonthIndex), [viewYear, viewMonthIndex]);

  const dayAppointments = useMemo(
    () =>
      appointments.filter(
        (a) => a.status !== 'cancelled' && toISODate(new Date(a.start_time)) === selectedDate
      ),
    [appointments, selectedDate]
  );

  const patientsForClient = useMemo(
    () => patients.filter((p) => p.client_id === form.client_id),
    [patients, form.client_id]
  );

  function selectDay(d) {
    setSelectedDate(toISODate(d));
    setScheduleWarning(null);
    if (d.getMonth() !== viewMonthIndex || d.getFullYear() !== viewYear) {
      setViewYear(d.getFullYear());
      setViewMonthIndex(d.getMonth());
    }
  }

  function goToMonth(delta) {
    const d = new Date(viewYear, viewMonthIndex + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonthIndex(d.getMonth());
  }

  // Shared by both the click handler (book here) and the hover handler
  // (preview here) so the two always agree on which slot the cursor is over.
  function computeSlot(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const minutesFromOpen = offsetY / PIXELS_PER_MINUTE;
    const snapped = Math.round(minutesFromOpen / SNAP_MINUTES) * SNAP_MINUTES;
    const clamped = Math.max(0, Math.min(snapped, (CLOSE_HOUR - OPEN_HOUR) * 60 - SNAP_MINUTES));
    const totalMinutes = OPEN_HOUR * 60 + clamped;
    const time = `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
    return { minutesFromOpen: clamped, time };
  }

  function pickFromGrid(e, roomId) {
    const { time } = computeSlot(e);
    // A surgery room's column should default the form to a surgery booking
    // (10-min increments) instead of the usual 15-min consult, so picking a
    // slot there doesn't also require manually flipping the type dropdown.
    const room = rooms.find((r) => r.id === roomId);
    const type = room?.type === 'surgery' ? 'surgery' : 'consult';
    setForm({ ...form, time, room_id: roomId, type, duration_minutes: '10' });
    setError(null);
    setScheduleWarning(null);
    // Jump straight to the booking form so a click on the schedule is enough
    // to continue — no manual scrolling down to find where the pick landed.
    bookingFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function hoverGrid(e, roomId) {
    const { minutesFromOpen, time } = computeSlot(e);
    setHoverSlot({ roomId, top: minutesFromOpen * PIXELS_PER_MINUTE, label: formatSlotLabel(time) });
  }

  async function submitAppointment(payload) {
    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to book appointment');
      setScheduleWarning(null);
    } else if (data.warning === 'schedule') {
      const vetName = vets.find((v) => v.id === payload.vet_id)?.full_name || 'This vet';
      const dayLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], { weekday: 'long' });
      setScheduleWarning({
        message: `${vetName} isn't scheduled to work ${payload.shift}s on ${dayLabel}s. Book anyway?`,
        payload,
      });
    } else {
      setScheduleWarning(null);
      setForm({ ...emptyForm, client_id: form.client_id });
      loadMonth();
    }
    return res.ok;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.time || !form.room_id) {
      setError('Click a spot on the schedule below first to pick a room and time');
      return;
    }
    if (!form.client_id || !form.patient_id) {
      setError('Select an owner and patient');
      return;
    }
    setSubmitting(true);
    setError(null);
    setScheduleWarning(null);

    const startTime = new Date(`${selectedDate}T${form.time}:00`);

    const payload = {
      patient_id: form.patient_id,
      room_id: form.room_id,
      vet_id: form.vet_id || null,
      type: form.type,
      start_time: startTime.toISOString(),
      duration_minutes: form.type === 'surgery' ? Number(form.duration_minutes) : undefined,
      reason: form.reason,
      // Computed from the local date/time (not re-derived from start_time
      // server-side) so the vet's schedule is checked against the day/shift
      // clinic staff actually see on screen, regardless of server timezone.
      weekday: startTime.getDay(),
      shift: startTime.getHours() < 12 ? 'morning' : 'afternoon',
    };

    await submitAppointment(payload);
    setSubmitting(false);
  }

  async function bookAnyway() {
    if (!scheduleWarning) return;
    setSubmitting(true);
    setError(null);
    await submitAppointment({ ...scheduleWarning.payload, override_schedule_warning: true });
    setSubmitting(false);
  }

  async function cancelAppointment(id) {
    await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    loadMonth();
  }

  async function checkIn(appointmentId) {
    await fetch('/api/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointment_id: appointmentId }),
    });
    loadMonth();
  }

  // Double-clicking a booked slot on the schedule jumps straight into its
  // consult — checking the patient in first if that hasn't happened yet, or
  // opening the consult record that's already in progress (or finished).
  async function openConsult(appointment) {
    if (openingConsultId) return;
    setOpeningConsultId(appointment.id);
    try {
      if (appointment.status === 'booked') {
        const res = await fetch('/api/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointment_id: appointment.id }),
        });
        const data = await res.json();
        if (res.ok && data.id) {
          router.push(`/consults/${data.id}`);
          return;
        }
      } else if (appointment.status === 'checked_in' || appointment.status === 'complete') {
        const res = await fetch(`/api/visits?appointment_id=${appointment.id}`);
        const data = await res.json();
        const visit = Array.isArray(data) ? data[0] : null;
        if (visit?.id) {
          router.push(`/consults/${visit.id}`);
          return;
        }
      }
    } finally {
      setOpeningConsultId(null);
    }
  }

  const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const monthLabel = new Date(viewYear, viewMonthIndex, 1).toLocaleDateString([], {
    month: 'short',
    year: 'numeric',
  });

  return (
    <div>
      <h1>Appointments</h1>

      <div className="schedule-layout">
        <div className="date-nav">
          <div className="mini-cal-header">
            <button type="button" onClick={() => goToMonth(-1)} aria-label="Previous month">
              &lsaquo;
            </button>
            <span>{monthLabel}</span>
            <button type="button" onClick={() => goToMonth(1)} aria-label="Next month">
              &rsaquo;
            </button>
          </div>
          <div className="mini-cal-grid">
            {WEEKDAY_LETTERS.map((w, i) => (
              <div key={i} className="mini-cal-weekday">
                {w}
              </div>
            ))}
            {monthGrid.map((d) => {
              const iso = toISODate(d);
              const inMonth = d.getMonth() === viewMonthIndex;
              const isSelected = iso === selectedDate;
              const isToday = iso === todayISODate();
              return (
                <button
                  type="button"
                  key={iso}
                  className={[
                    'mini-cal-day',
                    inMonth ? '' : 'mini-cal-day-outside',
                    isSelected ? 'mini-cal-day-selected' : '',
                    isToday && !isSelected ? 'mini-cal-day-today' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => selectDay(d)}
                >
                  {d.getDate()}
                  {countsByDate[iso] > 0 && <span className="mini-cal-day-dot" />}
                </button>
              );
            })}
          </div>
          <button type="button" className="date-nav-today" onClick={() => selectDay(new Date())}>
            Today
          </button>
          <p className="date-nav-label">{selectedDateLabel}</p>
        </div>

        <div className="schedule-main">
          {vets.length > 0 && (
            <div className="vet-legend">
              {vets.map((v) => (
                <span key={v.id} className="vet-legend-item">
                  <span
                    className="vet-legend-swatch"
                    style={{ background: colorForVet(v.id).bg, borderColor: colorForVet(v.id).fg }}
                  />
                  {v.full_name}
                </span>
              ))}
              <span className="vet-legend-item">
                <span
                  className="vet-legend-swatch"
                  style={{ background: UNASSIGNED_COLOR.bg, borderColor: UNASSIGNED_COLOR.fg }}
                />
                Unassigned
              </span>
            </div>
          )}

          {loading ? (
            <p>Loading...</p>
          ) : rooms.length === 0 ? (
            <p>
              No rooms set up yet — add one on the <a href="/rooms">Rooms</a> page first.
            </p>
          ) : (
            <div
              className="schedule-wrap"
              // Cap it to exactly what the fixed-width columns need — without
              // this, the flex row's leftover space stretches the bordered
              // box out with a big blank area past the last room column.
              style={{ maxWidth: TIME_COL_WIDTH + rooms.length * ROOM_COL_WIDTH + 2 }}
            >
              <div className="schedule-time-col">
                <div className="schedule-header schedule-time-header" />
                <div className="schedule-time-track" style={{ height: SCHEDULE_HEIGHT }}>
                  {HOUR_MARKS.map((h) => (
                    <div
                      key={h}
                      className="schedule-hour-label"
                      style={{ top: (h - OPEN_HOUR) * 60 * PIXELS_PER_MINUTE }}
                    >
                      {pad(h)}:00
                    </div>
                  ))}
                </div>
              </div>
              {rooms.map((room) => (
                <div key={room.id} className="schedule-room-col">
                  <div className="schedule-header">{room.name}</div>
                  <div
                    className="schedule-room-track"
                    style={{ height: SCHEDULE_HEIGHT }}
                    onClick={(e) => pickFromGrid(e, room.id)}
                    onMouseMove={(e) => hoverGrid(e, room.id)}
                    onMouseLeave={() => setHoverSlot(null)}
                  >
                    {HOUR_MARKS.map((h) => (
                      <div
                        key={h}
                        className="schedule-hour-line"
                        style={{ top: (h - OPEN_HOUR) * 60 * PIXELS_PER_MINUTE }}
                      />
                    ))}
                    {QUARTER_MARKS.map((m) => (
                      <div key={m} className="schedule-quarter-line" style={{ top: m * PIXELS_PER_MINUTE }} />
                    ))}
                    {hoverSlot && hoverSlot.roomId === room.id && (
                      <div
                        className="schedule-hover-slot"
                        style={{ top: hoverSlot.top, height: SNAP_MINUTES * PIXELS_PER_MINUTE }}
                      >
                        <span className="schedule-hover-label">{hoverSlot.label}</span>
                      </div>
                    )}
                    {dayAppointments
                      .filter((a) => a.room_id === room.id)
                      .map((a) => {
                        const color = colorForVet(a.vet_id);
                        const top = minutesSinceOpen(a.start_time) * PIXELS_PER_MINUTE;
                        const height = Math.max(a.duration_minutes * PIXELS_PER_MINUTE, 22);
                        return (
                          <div
                            key={a.id}
                            className={[
                              'schedule-block',
                              openingConsultId === a.id ? 'schedule-block-opening' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            style={{
                              top,
                              height,
                              background: color.bg,
                              borderColor: color.fg,
                              color: color.fg,
                            }}
                            title="Double-click to open the consult"
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              openConsult(a);
                            }}
                            onMouseMove={(e) => e.stopPropagation()}
                            onMouseEnter={() => setHoverSlot(null)}
                          >
                            <strong>{a.patients?.name}</strong> {formatTime(a.start_time)} ·{' '}
                            {a.type} · {a.status}
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="booking-panel">
          <form className="card" ref={bookingFormRef} onSubmit={handleSubmit}>
            <h2>Book Appointment</h2>
            {error && <p className="error">{error}</p>}
            <p>
              {form.time && form.room_id
                ? `Booking ${selectedDateLabel} at ${form.time} in ${
                    rooms.find((r) => r.id === form.room_id)?.name || ''
                  }`
                : 'Click a spot on the schedule to pick a room and time'}
            </p>

            <SearchSelect
              items={clients}
              value={form.client_id}
              onChange={(client_id) => setForm({ ...form, client_id, patient_id: '' })}
              getLabel={(c) => c.full_name}
              getSubLabel={(c) => c.phone}
              placeholder="Select owner..."
            />

            <SearchSelect
              items={patientsForClient}
              value={form.patient_id}
              onChange={(patient_id) => setForm({ ...form, patient_id })}
              getLabel={(p) => p.name}
              getSubLabel={(p) => p.species}
              placeholder="Select patient..."
              disabled={!form.client_id}
            />

            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value, duration_minutes: '10' })}
            >
              <option value="consult">Consult (15 min)</option>
              <option value="surgery">Surgery (10-min increments)</option>
            </select>

            {form.type === 'surgery' && (
              <input
                type="number"
                min="10"
                step="10"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                placeholder="Duration (minutes, multiple of 10)"
              />
            )}

            <select
              required
              value={form.room_id}
              onChange={(e) => setForm({ ...form, room_id: e.target.value })}
            >
              <option value="">Select room...</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            <select
              value={form.vet_id}
              onChange={(e) => {
                setForm({ ...form, vet_id: e.target.value });
                setScheduleWarning(null);
              }}
            >
              <option value="">Select vet (optional)...</option>
              {vets.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.full_name}
                </option>
              ))}
            </select>

            <input
              placeholder="Reason for visit"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />

            {scheduleWarning ? (
              <div className="possible-duplicate-warning">
                <p>{scheduleWarning.message}</p>
                <button type="button" onClick={bookAnyway} disabled={submitting}>
                  {submitting ? 'Booking...' : 'Book Anyway'}
                </button>{' '}
                <button type="button" onClick={() => setScheduleWarning(null)}>
                  Change Vet or Time
                </button>
              </div>
            ) : (
              <button type="submit" disabled={submitting || !form.time || !form.room_id}>
                {submitting ? 'Booking...' : 'Book Appointment'}
              </button>
            )}
          </form>
        </div>
      </div>

      <h2>{selectedDateLabel} — list</h2>
      <div className="appointments-day-list-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Patient</th>
              <th>Room</th>
              <th>Vet</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {dayAppointments.length === 0 && (
              <tr>
                <td colSpan={7}>No appointments booked for this day.</td>
              </tr>
            )}
            {dayAppointments.map((a) => (
              <tr key={a.id}>
                <td>
                  {formatTime(a.start_time)} ({a.duration_minutes}m)
                </td>
                <td>{a.type}</td>
                <td>{a.patients?.name}</td>
                <td>{a.rooms?.name}</td>
                <td>{a.staff?.full_name || '—'}</td>
                <td>{a.status}</td>
                <td>
                  {a.status === 'booked' && (
                    <button type="button" onClick={() => checkIn(a.id)}>
                      Check In
                    </button>
                  )}
                  {a.status === 'checked_in' && <a href="/consults">View Consult</a>}
                  {a.status !== 'cancelled' && a.status !== 'complete' && (
                    <button type="button" onClick={() => cancelAppointment(a.id)}>
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
