// app/hospitalization/page.jsx
// Hospitalization admissions: currently admitted, and recently discharged.
// Most admissions start from a consult's "Admit to Hospitalization" button;
// this also allows a standalone admit for a patient already in-house.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const emptyForm = { client_id: '', patient_id: '', room_id: '', reason: '' };

export default function HospitalizationPage() {
  const [admissions, setAdmissions] = useState([]);
  const [clients, setClients] = useState([]);
  const [patients, setPatients] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const loadAdmissions = () =>
    fetch('/api/hospitalizations')
      .then((res) => res.json())
      .then((data) => {
        setAdmissions(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    loadAdmissions();
    Promise.all([
      fetch('/api/clients').then((res) => res.json()),
      fetch('/api/patients').then((res) => res.json()),
      fetch('/api/rooms').then((res) => res.json()),
    ]).then(([clientsData, patientsData, roomsData]) => {
      setClients(Array.isArray(clientsData) ? clientsData : []);
      setPatients(Array.isArray(patientsData) ? patientsData : []);
      setRooms(Array.isArray(roomsData) ? roomsData : []);
    });

    const channel = supabase
      .channel('hospitalizations-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalizations' }, () =>
        loadAdmissions()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/hospitalizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to admit patient');
    } else {
      setForm(emptyForm);
      loadAdmissions();
    }
    setSubmitting(false);
  }

  if (loading) return <p>Loading admissions...</p>;

  const admitted = admissions.filter((a) => a.status === 'admitted');
  const discharged = admissions.filter((a) => a.status === 'discharged').slice(0, 20);
  const patientsForClient = patients.filter((p) => p.client_id === form.client_id);

  return (
    <div>
      <h1>Hospitalization</h1>

      <div className="split">
      <div className="split-main">
      <h2>Currently Admitted</h2>
      {admitted.length === 0 ? (
        <p>No patients currently admitted.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Owner</th>
              <th>Room</th>
              <th>Reason</th>
              <th>Admitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {admitted.map((a) => (
              <tr key={a.id}>
                <td>{a.patients?.name}</td>
                <td>{a.clients?.full_name}</td>
                <td>{a.rooms?.name || '—'}</td>
                <td>{a.reason || '—'}</td>
                <td>{new Date(a.admitted_at).toLocaleString()}</td>
                <td>
                  <a href={`/hospitalization/${a.id}`}>Open</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Recently Discharged</h2>
      {discharged.length === 0 ? (
        <p>No discharges yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Owner</th>
              <th>Discharged</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {discharged.map((a) => (
              <tr key={a.id}>
                <td>{a.patients?.name}</td>
                <td>{a.clients?.full_name}</td>
                <td>{a.discharged_at ? new Date(a.discharged_at).toLocaleString() : '—'}</td>
                <td>
                  <a href={`/hospitalization/${a.id}`}>Open</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </div>

      <div className="split-aside">
      <form className="card" onSubmit={handleSubmit}>
        <h2>Admit Patient</h2>
        <p>Usually started from a consult's "Admit to Hospitalization" button — use this for a standalone admission.</p>
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
        <select value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })}>
          <option value="">Select room (optional)...</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <input
          placeholder="Reason for admission"
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Admitting...' : 'Admit Patient'}
        </button>
      </form>
      </div>
      </div>
    </div>
  );
}
