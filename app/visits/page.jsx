// app/visits/page.jsx
// Active visits board: one card per in-progress visit (across rooms), each
// with its own live consult-notes thread. A note added on one terminal
// appears instantly on every other terminal viewing that visit.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

function elapsedMinutes(startedAt) {
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
}

function NoteThread({ visitId, staff }) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState('');
  const [authorId, setAuthorId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadNotes = () =>
    fetch(`/api/consult-notes?visit_id=${visitId}`)
      .then((res) => res.json())
      .then((data) => setNotes(Array.isArray(data) ? data : []));

  useEffect(() => {
    loadNotes();

    const channel = supabase
      .channel(`consult-notes-${visitId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'consult_notes', filter: `visit_id=eq.${visitId}` },
        () => loadNotes()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  async function handleAddNote(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);

    await fetch('/api/consult-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_id: visitId, author_id: authorId || null, note_text: text }),
    });

    setText('');
    loadNotes();
    setSubmitting(false);
  }

  return (
    <div className="notes">
      <ul className="note-list">
        {notes.map((n) => (
          <li key={n.id}>
            <span className="note-author">{n.staff?.full_name || 'Unknown'}:</span> {n.note_text}
          </li>
        ))}
        {notes.length === 0 && <li className="note-empty">No notes yet.</li>}
      </ul>
      <form onSubmit={handleAddNote} className="note-form">
        <select value={authorId} onChange={(e) => setAuthorId(e.target.value)}>
          <option value="">Author...</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
        <input
          placeholder="Add a note..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={submitting}>
          Add
        </button>
      </form>
    </div>
  );
}

function VisitCard({ visit, staff, onComplete }) {
  return (
    <div className="visit-card">
      <div className="visit-header">
        <div>
          <strong>{visit.rooms?.name}</strong> — {visit.patients?.name} (
          {visit.patients?.species})
        </div>
        <button type="button" onClick={() => onComplete(visit.id)}>
          Complete Visit
        </button>
      </div>
      <div className="visit-meta">
        Owner: {visit.clients?.full_name} · Vet: {visit.staff?.full_name || 'unassigned'} ·{' '}
        {elapsedMinutes(visit.started_at)} min in progress
      </div>
      <NoteThread visitId={visit.id} staff={staff} />
    </div>
  );
}

const emptyWalkIn = { client_id: '', patient_id: '', room_id: '', attending_vet_id: '' };

export default function VisitsPage() {
  const [visits, setVisits] = useState([]);
  const [clients, setClients] = useState([]);
  const [patients, setPatients] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [walkIn, setWalkIn] = useState(emptyWalkIn);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const loadVisits = () =>
    fetch('/api/visits?status=in_progress')
      .then((res) => res.json())
      .then((data) => {
        setVisits(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    loadVisits();
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
      .channel('visits-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () =>
        loadVisits()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function completeVisit(id) {
    await fetch(`/api/visits/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'complete' }),
    });
    loadVisits();
  }

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
      setError(data.error || 'Failed to start visit');
    } else {
      setWalkIn(emptyWalkIn);
      loadVisits();
    }
    setSubmitting(false);
  }

  const patientsForClient = patients.filter((p) => p.client_id === walkIn.client_id);
  const vets = staff.filter((s) => s.role === 'vet');

  return (
    <div>
      <h1>Active Visits</h1>
      <p>
        Visits start automatically when an appointment is checked in from the{' '}
        <a href="/appointments">Appointments</a> page, or as a walk-in below.
      </p>

      {loading ? (
        <p>Loading visits...</p>
      ) : visits.length === 0 ? (
        <p>No active visits right now.</p>
      ) : (
        <div className="visit-board">
          {visits.map((v) => (
            <VisitCard key={v.id} visit={v} staff={vets} onComplete={completeVisit} />
          ))}
        </div>
      )}

      <form className="card" onSubmit={handleWalkIn}>
        <h2>Start Walk-in Visit</h2>
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
          {submitting ? 'Starting...' : 'Start Visit'}
        </button>
      </form>
    </div>
  );
}
