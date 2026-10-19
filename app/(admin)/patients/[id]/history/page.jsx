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
import { openWhatsApp } from '@/lib/whatsapp';

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
  const [sharing, setSharing] = useState(null); // 'whatsapp' | 'email' | null
  const [emailSent, setEmailSent] = useState(false);

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

  // A fresh signed link each time (lib/historyLink.js): it works for 30 days.
  async function historyLink() {
    const res = await fetch(`/api/patients/${id}/history-link`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(data.error || 'Could not make the link.');
    return data.url;
  }

  function shareMessage(url) {
    const owner = patient.clients?.full_name ? patient.clients.full_name.split(' ')[0] : 'there';
    return `Hi ${owner}, here is ${patient.name}'s full medical history from Europets: ${url}\n\nThe link works for 30 days. Let us know if you need anything else.`;
  }

  async function shareWhatsApp() {
    setSharing('whatsapp');
    setError(null);
    try {
      openWhatsApp(patient.clients?.phone, shareMessage(await historyLink()));
    } catch (e) {
      setError(e.message);
    }
    setSharing(null);
  }

  async function shareEmail() {
    setSharing('email');
    setError(null);
    try {
      const url = await historyLink();
      const res = await fetch(`/api/clients/${patient.clients.id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: `${patient.name}: medical history`, text: shareMessage(url) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send the email.');
      setEmailSent(true);
    } catch (e) {
      setError(e.message);
    }
    setSharing(null);
  }

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
      <div className="page-header history-header">
        <h1>
          History · {patient.name}
          {patient.patient_number ? <span className="visit-meta"> #{patient.patient_number}</span> : null}
        </h1>
        <div className="page-header-actions">
          <a href={`/patients/${id}`} className="button-link history-back">&larr; {patient.name}</a>
        </div>
      </div>
      {/* Send the owner the whole history as one PDF (lib/patientHistoryPdf.js):
          the pet's details, vaccinations and everything below. */}
      <div className="share-actions history-share">
        <span className="visit-meta">Send:</span>
        <a className="share-btn" href={`/api/patients/${id}/history-pdf`} target="_blank" rel="noreferrer">
          📄 PDF
        </a>
        <button type="button" className="share-btn" onClick={shareWhatsApp} disabled={!patient.clients?.phone || !!sharing}>
          {sharing === 'whatsapp' ? '...' : '💬 WhatsApp'}
        </button>
        <button type="button" className="share-btn" onClick={shareEmail} disabled={!patient.clients?.email || !!sharing}>
          {sharing === 'email' ? 'Sending...' : emailSent ? '✅ Sent' : '✉️ Email'}
        </button>
      </div>
      <p className="visit-meta">
        Every consult and hospitalization summary, procedure report, and test on file for this patient, newest
        first ({rows.length}). The PDF adds the pet&apos;s details, microchip and vaccinations; no invoices or prices.
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
