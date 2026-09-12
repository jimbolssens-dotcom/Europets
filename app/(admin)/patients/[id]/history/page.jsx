// app/patients/[id]/history/page.jsx
// Full Patient History: every consult/hospitalization AI summary, every
// procedure report (dental/surgical/ultrasound/x-ray), and every test
// ever recorded for this patient, in one place, newest first, full text
// (not the truncated preview PatientReportOverview shows elsewhere) —
// built from the same GET /api/patients/:id/report-overview this repo
// already uses for that shorter widget.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatDateTime } from '@/lib/formatTimestamp';

const KIND_ICONS = {
  'Consult report': '🩺',
  'Hospitalization report': '🏥',
  'Dental report': '🦷',
  'Surgical report': '🔪',
  'Ultrasound report': '🔊',
  'X-ray report': '🩻',
};

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

      {rows.length === 0 ? (
        <p>No reports or tests recorded for this patient yet.</p>
      ) : (
        <ul className="consult-history-list patient-full-history-list">
          {rows.map((row) => {
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
                ) : (
                  <p className="visit-meta">No result recorded yet.</p>
                )}
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
