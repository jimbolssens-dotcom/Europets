// app/patients/[id]/history/page.jsx
// Full Patient History: every consult/hospitalization AI summary, every
// procedure report (dental/surgical/ultrasound/x-ray/gastroscopy), and
// every test ever recorded for this patient, in one place, newest first, full text
// (not the truncated preview PatientReportOverview shows elsewhere) —
// built from the same GET /api/patients/:id/report-overview this repo
// already uses for that shorter widget.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatDateTime } from '@/lib/formatTimestamp';
import RecordPhotoStrip from '@/app/_components/RecordPhotoStrip';

const KIND_ICONS = {
  'Consult report': '🩺',
  'Hospitalization report': '🏥',
  'Dental report': '🦷',
  'Surgical report': '🔪',
  'Ultrasound report': '🔊',
  'X-ray report': '🩻',
  'Consult photos': '📷',
  'Stay photos': '📷',
};

function recordHref(photo) {
  return photo.record_type === 'visit' ? `/consults/${photo.record_id}` : `/hospitalization/${photo.record_id}`;
}

function iconFor(kind) {
  return KIND_ICONS[kind] || '🧪';
}

function textFor(row) {
  return row.ai_summary || row.result || row.findings || row.notes || row.procedure_name || null;
}

export default function PatientFullHistoryPage() {
  const { id } = useParams();
  const [patient, setPatient] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [photos, setPhotos] = useState([]);

  function loadRows() {
    fetch(`/api/patients/${id}/report-overview`)
      .then((res) => res.json())
      .then((rowsData) => setRows(Array.isArray(rowsData) ? rowsData : []));
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/patients/${id}`).then((res) => res.json()),
      fetch(`/api/patients/${id}/report-overview`).then((res) => res.json()),
    ]).then(([patientData, rowsData]) => {
      setPatient(patientData);
      setRows(Array.isArray(rowsData) ? rowsData : []);
      setLoading(false);
    });
    fetch(`/api/patients/${id}/photos`)
      .then((res) => res.json())
      .then((data) => setPhotos(Array.isArray(data) ? data : []))
      .catch(() => setPhotos([]));
  }, [id]);

  function startEdit(row, text) {
    setError(null);
    setEditingId(row.id);
    setDraft(text || '');
  }

  async function saveEdit(row) {
    setBusyId(row.id);
    setError(null);
    try {
      const response = await fetch(`${row.apiBase}/${row.recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [row.editableField]: draft }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not save changes.');
      setEditingId(null);
      loadRows();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRow(row) {
    if (!confirm(`Delete this ${row.kind.toLowerCase()}? This cannot be undone.`)) return;
    setBusyId(row.id);
    setError(null);
    try {
      const response = row.deleteMode === 'clear'
        ? await fetch(`${row.apiBase}/${row.recordId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [row.editableField]: null }) })
        : await fetch(`${row.apiBase}/${row.recordId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not delete.');
      if (editingId === row.id) setEditingId(null);
      loadRows();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  // Photos sit under the newest row for their consult/stay; a record with
  // photos but no report or test yet gets a row of its own so they still show.
  const photosByHref = new Map();
  for (const p of photos) {
    const href = recordHref(p);
    if (!photosByHref.has(href)) photosByHref.set(href, []);
    photosByHref.get(href).push(p);
  }
  const hrefsWithRows = new Set(rows.map((r) => r.href));
  const photoOnlyRows = [...photosByHref.entries()]
    .filter(([href]) => !hrefsWithRows.has(href))
    .map(([href, list]) => ({
      id: `photos-${href}`,
      kind: list[0].record_type === 'visit' ? 'Consult photos' : 'Stay photos',
      date: list[list.length - 1].created_at,
      href,
      photoOnly: true,
    }));
  const displayRows = [...rows, ...photoOnlyRows].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const photoRowFor = new Map();
  for (const r of displayRows) if (!photoRowFor.has(r.href)) photoRowFor.set(r.href, r.id);

  if (loading) return <p>Loading patient history...</p>;
  if (!patient || patient.error) return <p>Patient not found.</p>;

  return (
    <div>
      <p>
        <a href={`/patients/${id}`}>&larr; Back to {patient.name}</a>
      </p>
      <h1>
        Full History — {patient.name}
        {patient.patient_number ? ` (Patient #${patient.patient_number})` : ''}
      </h1>
      <p className="visit-meta">
        Every consult and hospitalization summary, procedure report, and test on file for this patient, newest
        first ({rows.length}).
      </p>

      {error && <p className="error" role="alert">{error}</p>}

      {displayRows.length === 0 ? (
        <p>No reports or tests recorded for this patient yet.</p>
      ) : (
        <ul className="consult-history-list patient-full-history-list">
          {displayRows.map((row) => {
            const text = textFor(row);
            const canEdit = !!(row.editableField && row.apiBase && row.recordId);
            const isEditing = editingId === row.id;
            return (
              <li key={`${row.kind}-${row.id}`} className="consult-history-item patient-full-history-item">
                <p className="visit-meta">
                  <strong>
                    {iconFor(row.kind)} {row.kind}
                  </strong>{' '}
                  · {row.date ? formatDateTime(row.date) : 'Date not recorded'} ·{' '}
                  <a href={row.href}>Open record</a>
                </p>
                {isEditing ? (
                  <div className="postop-panel">
                    <textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} />
                    <div className="home-links">
                      <button type="button" onClick={() => saveEdit(row)} disabled={busyId === row.id}>
                        {busyId === row.id ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" className="secondary" onClick={() => setEditingId(null)} disabled={busyId === row.id}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : text ? (
                  <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
                ) : row.photoOnly ? null : (
                  <p className="visit-meta">No result recorded yet.</p>
                )}
                {photoRowFor.get(row.href) === row.id && <RecordPhotoStrip photos={photosByHref.get(row.href)} />}
                {canEdit && !isEditing && (
                  <div className="home-links">
                    <button type="button" className="secondary" onClick={() => startEdit(row, text)} disabled={busyId === row.id}>
                      Edit
                    </button>
                    <button type="button" onClick={() => deleteRow(row)} disabled={busyId === row.id}>
                      {busyId === row.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
