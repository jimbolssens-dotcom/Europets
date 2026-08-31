// app/consults/page.jsx
// Consults board: active consults (in progress) and a quick list of
// recently completed ones, each linking through to the full consult
// record. Consults start automatically when an appointment is checked in
// from the Appointments page, or as a walk-in below.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

function elapsedMinutes(startedAt) {
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
}

const emptyWalkIn = { client_id: '', patient_id: '', room_id: '', attending_vet_id: '' };

export default function ConsultsPage() {
  const [consults, setConsults] = useState([]);
  const [clients, setClients] = useState([]);
  const [patients, setPatients] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [walkIn, setWalkIn] = useState(emptyWalkIn);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const loadConsults = () =>
    fetch('/api/visits')
      .then((res) => res.json())
      .then((data) => {
        setConsults(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    loadConsults();
    Promise.all([
      fetch('/api/clients').then((res) => res.json()),
      fetch('/api/patients').then((res) => res.json()),
      fetch('/api/rooms').then((res) => res.json()),
      fetch('/api/staff').then((res) => res.json()),
    ]).then(([clientsData, patientsData, roomsData, staffData]) => {
      setClients(Array.isArray(clientsData) ? clientsData : []);
      setPatients(Array.isArray(patientsData) ? patientsData : []);
      setRooms(Array.isArray(roomsData) ? roomsData : []);
      setStaff(Array.isArray(staffData) ? staffData : []);
    });

    const channel = supabase
      .channel('consults-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () =>
        loadConsults()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function handleWalkIn(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: walkIn.patient_id,
        room_id: walkIn.room_id,
        attending_vet_id: walkIn.attending_vet_id || null,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to start consult');
    } else {
      setWalkIn(emptyWalkIn);
      loadConsults();
    }
    setSubmitting(false);
  }

  if (loading) return <p>Loading consults...</p>;

  const active = consults.filter((c) => c.status === 'in_progress');
  const completed = consults
    .filter((c) => c.status === 'complete')
    .sort((a, b) => new Date(b.ended_at || b.started_at) - new Date(a.ended_at || a.started_at))
    .slice(0, 20);

  const patientsForClient = patients.filter((p) => p.client_id === walkIn.client_id);
  const vets = staff.filter((s) => s.role === 'vet');

  return (
    <div>
      <h1>Consults</h1>

      <h2>Active</h2>
      {active.length === 0 ? (
        <p>No active consults right now.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Owner</th>
              <th>Room</th>
              <th>Vet</th>
              <th>In progress</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {active.map((c) => (
              <tr key={c.id}>
                <td>{c.patients?.name}</td>
                <td>{c.clients?.full_name}</td>
                <td>{c.rooms?.name}</td>
                <td>{c.staff?.full_name || 'unassigned'}</td>
                <td>{elapsedMinutes(c.started_at)} min</td>
                <td>
                  <a href={`/consults/${c.id}`}>Open</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Recently completed</h2>
      {completed.length === 0 ? (
        <p>No completed consults yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Owner</th>
              <th>Ended</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {completed.map((c) => (
              <tr key={c.id}>
                <td>{c.patients?.name}</td>
                <td>{c.clients?.full_name}</td>
                <td>{c.ended_at ? new Date(c.ended_at).toLocaleString() : '—'}</td>
                <td>
                  <a href={`/consults/${c.id}`}>Open</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form className="card" onSubmit={handleWalkIn}>
        <h2>Start Walk-in Consult</h2>
        {error && <p className="error">{error}</p>}
        <select
          required
          value={walkIn.client_id}
          onChange={(e) => setWalkIn({ ...walkIn, client_id: e.target.value, patient_id: '' })}
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
          disabled={!walkIn.client_id}
          value={walkIn.patient_id}
          onChange={(e) => setWalkIn({ ...walkIn, patient_id: e.target.value })}
        >
          <option value="">Select patient...</option>
          {patientsForClient.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.species})
            </option>
          ))}
        </select>
        <select
          required
          value={walkIn.room_id}
          onChange={(e) => setWalkIn({ ...walkIn, room_id: e.target.value })}
        >
          <option value="">Select room...</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          value={walkIn.attending_vet_id}
          onChange={(e) => setWalkIn({ ...walkIn, attending_vet_id: e.target.value })}
        >
          <option value="">Select vet (optional)...</option>
          {vets.map((v) => (
            <option key={v.id} value={v.id}>
              {v.full_name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Starting...' : 'Start Consult'}
        </button>
      </form>
    </div>
  );
}
