// app/appointments/page.jsx
// Month calendar overview + an Outlook-style day schedule: one column per
// room, continuous time down the side, appointments as colored blocks
// positioned by their actual start time/duration and color-coded by vet.
// Click empty grid space to pick a room + time for a new booking.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const OPEN_HOUR = 8;
const CLOSE_HOUR = 19;
const PIXELS_PER_MINUTE = 1.4;
const SNAP_MINUTES = 15;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

// build a 6-row Sun-start grid of Date objects covering the given month,
// padded with the trailing days of the previous/next month
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
const SCHEDULE_HEIGHT = (CLOSE_HOUR - OPEN_HOUR) * 60 * PIXELS_PER_MINUTE;

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

  const dayAppointments = useMemo(
    () =>
      appointments.filter(
        (a) => a.status !== 'cancelled' && toISODate(new Date(a.start_time)) === selectedDate
      ),
    [appointments, selectedDate]
  );

  const monthGrid = useMemo(() => buildMonthGrid(viewYear, viewMonthIndex), [viewYear, viewMonthIndex]);

  const patientsForClient = useMemo(
    () => patients.filter((p) => p.client_id === form.client_id),
    [patients, form.client_id]
  );

  function goToMonth(delta) {
    const d = new Date(viewYear, viewMonthIndex + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonthIndex(d.getMonth());
  }

  function selectDay(d) {
    setSelectedDate(toISODate(d));
    if (d.getMonth() !== viewMonthIndex || d.getFullYear() !== viewYear) {
      setViewYear(d.getFullYear());
      setViewMonthIndex(d.getMonth());
    }
  }

  function pickFromGrid(e, roomId) {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const minutesFromOpen = offsetY / PIXELS_PER_MINUTE;
    const snapped = Math.round(minutesFromOpen / SNAP_MINUTES) * SNAP_MINUTES;
    const clamped = Math.max(0, Math.min(snapped, (CLOSE_HOUR - OPEN_HOUR) * 60 - SNAP_MINUTES));
    const totalMinutes = OPEN_HOUR * 60 + clamped;
    const time = `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
    setForm({ ...form, time, room_id: roomId });
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.time || !form.room_id) {
      setError('Click a spot on the schedule below first to pick a room and time');
      return;
    }
    setSubmitting(true);
    setError(null);

    const startTime = new Date(`${selectedDate}T${form.time}:00`);

    const payload = {
      patient_id: form.patient_id,
      room_id: form.room_id,
      vet_id: form.vet_id || null,
      type: form.type,
      start_time: startTime.toISOString(),
      duration_minutes: form.type === 'surgery' ? Number(form.duration_minutes) : undefined,
      reason: form.reason,
    };

    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to book appointment');
    } else {
      setForm({ ...emptyForm, client_id: form.client_id });
      loadMonth();
    }
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

  const monthLabel = new Date(viewYear, viewMonthIndex, 1).toLocaleDateString([], {
    month: 'long',
    year: 'numeric',
  });
  const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div>
      <h1>Appointments</h1>

      <div className="cal-header">
        <button type="button" onClick={() => goToMonth(-1)}>
          &larr;
        </button>
        <strong>{monthLabel}</strong>
        <button type="button" onClick={() => goToMonth(1)}>
          &rarr;
        </button>
        <button type="button" onClick={() => selectDay(new Date())}>
          Today
        </button>
      </div>

      <div className="cal-grid">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="cal-weekday">
            {w}
          </div>
        ))}
        {monthGrid.map((d) => {
          const iso = toISODate(d);
          const inMonth = d.getMonth() === viewMonthIndex;
          const isSelected = iso === selectedDate;
          const isToday = iso === todayISODate();
          const count = countsByDate[iso] || 0;
          return (
            <button
              type="button"
              key={iso}
              className={[
                'cal-day',
                inMonth ? '' : 'cal-day-outside',
                isSelected ? 'cal-day-selected' : '',
                isToday ? 'cal-day-today' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => selectDay(d)}
            >
              <span className="cal-day-number">{d.getDate()}</span>
              {count > 0 && <span className="cal-day-badge">{count}</span>}
            </button>
          );
        })}
      </div>

      <h2>{selectedDateLabel}</h2>

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
        <div className="schedule-wrap">
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
              >
                {HOUR_MARKS.map((h) => (
                  <div
                    key={h}
                    className="schedule-hour-line"
                    style={{ top: (h - OPEN_HOUR) * 60 * PIXELS_PER_MINUTE }}
                  />
                ))}
                {dayAppointments
                  .filter((a) => a.room_id === room.id)
                  .map((a) => {
                    const color = colorForVet(a.vet_id);
                    const top = minutesSinceOpen(a.start_time) * PIXELS_PER_MINUTE;
                    const height = Math.max(a.duration_minutes * PIXELS_PER_MINUTE, 22);
                    return (
                      <div
                        key={a.id}
                        className="schedule-block"
                        style={{
                          top,
                          height,
                          background: color.bg,
                          borderColor: color.fg,
                          color: color.fg,
                        }}
                        onClick={(e) => e.stopPropagation()}
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

      <h2>{selectedDateLabel} — list</h2>
      <div className="split">
      <div className="split-main">
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

      <div className="split-aside">
      <form className="card" onSubmit={handleSubmit}>
        <h2>Book Appointment</h2>
        {error && <p className="error">{error}</p>}
        <p>
          {form.time && form.room_id
            ? `Booking ${selectedDateLabel} at ${form.time} in ${
                rooms.find((r) => r.id === form.room_id)?.name || ''
              }`
            : 'Click a spot on the schedule above to pick a room and time'}
        </p>

        <select
          required
          value={form.client_id}
          onChange={(e) => setForm({ ...form, client_id: e.target.value, patient_id: '' })}
        >
          <option value="">Select owner...</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>

        <select
          required
          disabled={!form.client_id}
          value={form.patient_id}
          onChange={(e) => setForm({ ...form, patient_id: e.target.value })}
        >
          <option value="">Select patient...</option>
          {patientsForClient.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.species})
            </option>
          ))}
        </select>

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

        <select value={form.vet_id} onChange={(e) => setForm({ ...form, vet_id: e.target.value })}>
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

        <button type="submit" disabled={submitting || !form.time || !form.room_id}>
          {submitting ? 'Booking...' : 'Book Appointment'}
        </button>
      </form>
      </div>
      </div>
    </div>
  );
}
