// app/appointments/page.jsx
// Month calendar overview + a clickable time-slot grid for booking.
// Consult slots are fixed at 15 minutes; surgery slots run in 10-minute
// increments. Booking a room/vet that's already taken for that time is
// rejected by the API (409).

'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const OPEN_HOUR = 8;
const CLOSE_HOUR = 19;
const SLOT_MINUTES = 15;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

function buildDaySlots() {
  const slots = [];
  for (let minutes = OPEN_HOUR * 60; minutes < CLOSE_HOUR * 60; minutes += SLOT_MINUTES) {
    slots.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
  }
  return slots;
}
const DAY_SLOTS = buildDaySlots();

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
    () => appointments.filter((a) => toISODate(new Date(a.start_time)) === selectedDate),
    [appointments, selectedDate]
  );

  // map each slot's "HH:MM" to the appointment occupying it, if any
  const slotMap = useMemo(() => {
    const map = {};
    for (const a of dayAppointments) {
      if (a.status === 'cancelled') continue;
      const start = new Date(a.start_time);
      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const slotsCovered = Math.ceil(a.duration_minutes / SLOT_MINUTES);
      for (let i = 0; i < slotsCovered; i++) {
        const minutes = startMinutes + i * SLOT_MINUTES;
        const key = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
        map[key] = { appointment: a, isStart: i === 0 };
      }
    }
    return map;
  }, [dayAppointments]);

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

  function pickSlot(time) {
    setForm({ ...form, time });
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.time) {
      setError('Pick a time slot below first');
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

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="slot-grid">
          {DAY_SLOTS.map((time) => {
            const occupied = slotMap[time];
            if (occupied && !occupied.isStart) {
              return <div key={time} className="slot slot-continued" />;
            }
            if (occupied) {
              const a = occupied.appointment;
              return (
                <div key={time} className="slot slot-booked">
                  <div className="slot-time">{time}</div>
                  <div className="slot-info">
                    <strong>{a.patients?.name}</strong> ({a.type}, {a.duration_minutes}m)
                    <br />
                    {a.rooms?.name} · {a.staff?.full_name || 'unassigned'} · {a.status}
                  </div>
                  <div className="slot-actions">
                    {a.status === 'booked' && (
                      <button type="button" onClick={() => checkIn(a.id)}>
                        Check In
                      </button>
                    )}
                    {a.status === 'checked_in' && <a href="/visits">View Visit</a>}
                    {a.status !== 'cancelled' && a.status !== 'complete' && (
                      <button type="button" onClick={() => cancelAppointment(a.id)}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            }
            return (
              <button
                type="button"
                key={time}
                className={`slot slot-free ${form.time === time ? 'slot-picked' : ''}`}
                onClick={() => pickSlot(time)}
              >
                <span className="slot-time">{time}</span>
                <span className="slot-pick-label">
                  {form.time === time ? 'Selected' : 'Book'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <form className="card" onSubmit={handleSubmit}>
        <h2>Book Appointment</h2>
        {error && <p className="error">{error}</p>}
        <p>
          {form.time
            ? `Booking ${selectedDateLabel} at ${form.time}`
            : 'Click a free slot above to pick a time'}
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

        <button type="submit" disabled={submitting || !form.time}>
          {submitting ? 'Booking...' : 'Book Appointment'}
        </button>
      </form>
    </div>
  );
}
