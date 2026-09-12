// app/_components/DayProcedureNotes.jsx
// A free-text note for a day procedure — dictated or typed, not tied to
// a specific checklist item (see ProcedureChecklist, which only ever logs
// a note when a checklist item is tapped done) — that still lands in
// hospitalization_notes, the same table lib/hospitalizationReportGeneration.js
// pulls from when it writes the day procedure's AI overview report. No
// separate wiring needed there: any note with text shows up in that
// report once it's (re)generated.

'use client';

import { useEffect, useState } from 'react';
import VoiceToTextButton from './VoiceToTextButton';
import { supabase } from '@/lib/supabaseClient';

const MOBILE_STAFF_STORAGE_KEY = 'europets_mobile_staff_id';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function DayProcedureNotes({ hospitalizationId, staff = [] }) {
  const [notes, setNotes] = useState([]);
  const [authorId, setAuthorId] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function loadNotes() {
    fetch(`/api/hospitalizations/${hospitalizationId}/notes`)
      .then((res) => res.json())
      .then((data) =>
        setNotes(Array.isArray(data) ? data.filter((n) => !n.plan_item_ids?.length && n.notes?.trim()) : [])
      );
  }

  useEffect(() => {
    loadNotes();
    const remembered = localStorage.getItem(MOBILE_STAFF_STORAGE_KEY);
    if (remembered) setAuthorId(remembered);

    const channel = supabase
      .channel(`day-procedure-notes-${hospitalizationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospitalization_notes', filter: `hospitalization_id=eq.${hospitalizationId}` },
        loadNotes
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalizationId]);

  function handleAuthorChange(value) {
    setAuthorId(value);
    localStorage.setItem(MOBILE_STAFF_STORAGE_KEY, value);
  }

  function appendDictated(spoken) {
    setText((prev) => (prev ? `${prev}\n${spoken}` : spoken));
  }

  async function addNote(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/hospitalizations/${hospitalizationId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note_date: todayISODate(), author_id: authorId || null, notes: text.trim() }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to add note');
      return;
    }
    setText('');
    loadNotes();
  }

  return (
    <form className="card" onSubmit={addNote}>
      <h3>Add a Note</h3>
      <p className="visit-meta">Dictated or typed — goes on this day procedure&apos;s overview report.</p>
      {error && <p className="error">{error}</p>}
      <select value={authorId} onChange={(e) => handleAuthorChange(e.target.value)}>
        <option value="">Author...</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </select>
      <label>
        <span className="field-label-row">
          Note
          <VoiceToTextButton kind="hospitalization_notes" onResult={appendDictated} />
        </span>
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Recovered well from anesthesia, ate normally at 3pm."
        />
      </label>
      <button type="submit" disabled={submitting || !text.trim()}>
        {submitting ? 'Saving...' : 'Add Note'}
      </button>

      {notes.length > 0 && (
        <ul className="day-procedure-notes-list">
          {notes.map((n) => (
            <li key={n.id}>
              <span className="visit-meta">
                {formatTime(n.created_at)}
                {n.staff?.full_name ? ` · ${n.staff.full_name}` : ''}
              </span>
              <p>{n.notes}</p>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
