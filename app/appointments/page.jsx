// app/appointments/page.jsx
// Day-view appointment calendar + booking form.
// Consult slots are fixed at 15 minutes; surgery slots run in 10-minute
// increments. Booking a room/vet that's already taken for that time is
// rejected by the API (409).

'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const emptyForm = {
  client_id: '',
  patient_id: '',
  room_id: '',
  vet_id: '',
  type: 'consult',
  time: '09:00',
  duration_minutes: '10',
  reason: '',
};

export default function AppointmentsPage() {
  const [date, setDate] = useState(todayISODate());
  const [appointments, setAppointments] = useState([]);
  const [clients, setClients] = useState([]);
  const [patients, setPatients] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [vets, setVets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const loadAppointments = (forDate) =>
    fetch(`/api/appointments?date=${forDate}`)
      .then((res) => res.json())
      .then((data) => {
        setAppointments(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    setLoading(true);
    loadAppointments(date);
  }, [date]);

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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => loadAppointments(date)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patientsForClient = useMemo(
    () => patients.filter((p) => p.client_id === form.client_id),
    [patients, form.client_id]
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const startTime = new Date(`${date}T${form.time}:00`);

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
      loadAppointments(date);
    }
    setSubmitting(false);
  }

  async function cancelAppointment(id) {
    await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    loadAppointments(date);
  }

  return (
    <div>
      <h1>Appointments</h1>

      <label>
        Date:{' '}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      {loading ? (
        <p>Loading appointments...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Patient</th>
              <th>Owner</th>
              <th>Room</th>
              <th>Vet</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {appointments.length === 0 && (
              <tr>
                <td colSpan={8}>No appointments booked for this day.</td>
              </tr>
            )}
            {appointments.map((a) => (
              <tr key={a.id}>
                <td>
                  {formatTime(a.start_time)} ({a.duration_minutes}m)
                </td>
                <td>{a.type}</td>
                <td>{a.patients?.name}</td>
                <td>{a.clients?.full_name}</td>
                <td>{a.rooms?.name}</td>
                <td>{a.staff?.full_name || '—'}</td>
                <td>{a.status}</td>
                <td>
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
      )}

      <form className="card" onSubmit={handleSubmit}>
        <h2>Book Appointment</h2>
        {error && <p className="error">{error}</p>}

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
          onChange={(e) =>
            setForm({ ...form, type: e.target.value, duration_minutes: '10' })
          }
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

        <input
          type="time"
          required
          value={form.time}
          onChange={(e) => setForm({ ...form, time: e.target.value })}
        />

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
          onChange={(e) => setForm({ ...form, vet_id: e.target.value })}
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

        <button type="submit" disabled={submitting}>
          {submitting ? 'Booking...' : 'Book Appointment'}
        </button>
      </form>
    </div>
  );
}
