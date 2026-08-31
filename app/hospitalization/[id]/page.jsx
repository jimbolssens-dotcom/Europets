// app/hospitalization/[id]/page.jsx
// A single admission: status, and the day-to-day worksheet — one entry
// per day covering appetite, condition, temperature, and notes, each
// with optional file attachments (e.g. a photo of a wound).

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AttachmentSection from '@/app/_components/AttachmentSection';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

const emptyNoteForm = {
  note_date: todayISODate(),
  author_id: '',
  appetite: '',
  condition: '',
  temperature_c: '',
  notes: '',
};

export default function HospitalizationDetailPage() {
  const { id } = useParams();
  const [admission, setAdmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState([]);
  const [notes, setNotes] = useState([]);
  const [noteForm, setNoteForm] = useState(emptyNoteForm);
  const [submitting, setSubmitting] = useState(false);

  const loadAdmission = () =>
    fetch(`/api/hospitalizations/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setAdmission(data);
        setLoading(false);
      });

  const loadNotes = () =>
    fetch(`/api/hospitalizations/${id}/notes`)
      .then((res) => res.json())
      .then((data) => setNotes(Array.isArray(data) ? data : []));

  useEffect(() => {
    loadAdmission();
    loadNotes();
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => setStaff(Array.isArray(data) ? data : []));

    const channel = supabase
      .channel(`hospitalization-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospitalizations', filter: `id=eq.${id}` },
        loadAdmission
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospitalization_notes', filter: `hospitalization_id=eq.${id}` },
        loadNotes
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function addNote(e) {
    e.preventDefault();
    setSubmitting(true);
    await fetch(`/api/hospitalizations/${id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(noteForm),
    });
    setNoteForm({ ...emptyNoteForm, note_date: todayISODate() });
    loadNotes();
    setSubmitting(false);
  }

  async function discharge() {
    await fetch(`/api/hospitalizations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'discharged' }),
    });
    loadAdmission();
  }

  if (loading || !admission) return <p>Loading admission...</p>;
  if (admission.error) return <p>Admission not found.</p>;

  return (
    <div>
      <p>
        <a href="/hospitalization">&larr; All admissions</a>
      </p>
      <h1>
        {admission.patients?.name} <span>({admission.status})</span>
      </h1>
      <p>
        Owner: <a href={`/clients/${admission.clients?.id}`}>{admission.clients?.full_name}</a> ·
        Room: {admission.rooms?.name || '—'} · Admitted:{' '}
        {new Date(admission.admitted_at).toLocaleString()}
        {admission.discharged_at &&
          ` · Discharged: ${new Date(admission.discharged_at).toLocaleString()}`}
      </p>
      {admission.reason && <p>Reason: {admission.reason}</p>}
      {admission.status === 'admitted' && (
        <button type="button" onClick={discharge}>
          Discharge
        </button>
      )}
      {admission.originating_visit_id && (
        <p>
          <a href={`/consults/${admission.originating_visit_id}`}>View originating consult</a>
        </p>
      )}

      <h2>Day-to-day Worksheet</h2>
      {notes.length === 0 && <p>No entries yet.</p>}
      {notes.map((n) => (
        <div key={n.id} className="visit-card">
          <div className="visit-header">
            <strong>{n.note_date}</strong>
            <span>{n.staff?.full_name || 'unassigned'}</span>
          </div>
          <p>
            {n.appetite && (
              <>
                <strong>Appetite:</strong> {n.appetite}{' '}
              </>
            )}
            {n.temperature_c != null && (
              <>
                · <strong>Temp:</strong> {n.temperature_c}°C{' '}
              </>
            )}
          </p>
          {n.condition && (
            <p>
              <strong>Condition:</strong> {n.condition}
            </p>
          )}
          {n.notes && <p>{n.notes}</p>}
          <AttachmentSection entityType="hospitalization_note" entityId={n.id} />
        </div>
      ))}

      <form className="card" onSubmit={addNote}>
        <h3>Add Worksheet Entry</h3>
        <input
          type="date"
          required
          value={noteForm.note_date}
          onChange={(e) => setNoteForm({ ...noteForm, note_date: e.target.value })}
        />
        <select
          value={noteForm.author_id}
          onChange={(e) => setNoteForm({ ...noteForm, author_id: e.target.value })}
        >
          <option value="">Author...</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
        <select
          value={noteForm.appetite}
          onChange={(e) => setNoteForm({ ...noteForm, appetite: e.target.value })}
        >
          <option value="">Appetite...</option>
          <option value="good">Good</option>
          <option value="reduced">Reduced</option>
          <option value="none">None</option>
        </select>
        <input
          type="number"
          step="0.1"
          placeholder="Temperature (°C)"
          value={noteForm.temperature_c}
          onChange={(e) => setNoteForm({ ...noteForm, temperature_c: e.target.value })}
        />
        <input
          placeholder="General condition"
          value={noteForm.condition}
          onChange={(e) => setNoteForm({ ...noteForm, condition: e.target.value })}
        />
        <input
          placeholder="Notes"
          value={noteForm.notes}
          onChange={(e) => setNoteForm({ ...noteForm, notes: e.target.value })}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Add Entry'}
        </button>
      </form>
    </div>
  );
}
