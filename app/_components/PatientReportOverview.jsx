'use client';
import { useEffect, useState } from 'react';

// Cross-record summary of every report on file for a patient (dental,
// surgical, ultrasound, x-ray, diagnostics, plus the consult/hospitalization
// AI summary itself) — most of these belong to a DIFFERENT record than the
// one currently open, so "Open record" is still how you navigate there.
// Edit/delete happen right here too, using the same PATCH/DELETE endpoints
// each record's own Reports section already calls (see RecordReports.jsx) —
// staff shouldn't have to leave the current page just to fix a typo or
// remove a report logged against the wrong case.
export default function PatientReportOverview({ patientId, title = 'Earlier reports for this patient' }) {
  const [rows, setRows] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    if (patientId) fetch(`/api/patients/${patientId}/report-overview`).then((r) => r.json()).then((d) => setRows(Array.isArray(d) ? d : []));
  }
  useEffect(load, [patientId]);

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
      load();
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
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return <details className="patient-report-overview">
    <summary className="button-link">📑 {title} {rows.length ? `(${rows.length})` : ''}</summary>
    {error && <p className="error" role="alert">{error}</p>}
    {rows.length === 0 ? <p className="visit-meta">No reports yet.</p> : <ul className="consult-history-list">
      {rows.map((r) => {
        const text = r.ai_summary || r.result_text || r.result || r.findings;
        const canEdit = !!(r.editableField && r.apiBase && r.recordId);
        const isEditing = editingId === r.id;
        return <li key={`${r.source}-${r.id}`} className="consult-history-item">
          <p className="visit-meta"><strong>{r.kind}</strong> · {r.date ? new Date(r.date).toLocaleString() : 'Date not recorded'} · <a href={r.href}>Open record</a></p>
          {isEditing
            ? <div className="postop-panel">
              <textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="home-links">
                <button type="button" onClick={() => saveEdit(r)} disabled={busyId === r.id}>{busyId === r.id ? 'Saving…' : 'Save'}</button>
                <button type="button" className="secondary" onClick={() => setEditingId(null)} disabled={busyId === r.id}>Cancel</button>
              </div>
            </div>
            : text && <p>{text.slice(0, 240)}</p>}
          {canEdit && !isEditing && <div className="home-links">
            <button type="button" className="secondary" onClick={() => startEdit(r, text)} disabled={busyId === r.id}>Edit</button>
            <button type="button" onClick={() => deleteRow(r)} disabled={busyId === r.id}>{busyId === r.id ? 'Deleting…' : 'Delete'}</button>
          </div>}
        </li>;
      })}
    </ul>}
  </details>;
}
