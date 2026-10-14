'use client';

// app/_components/PatientHistoryFiles.jsx
// "Outside history & results" on the patient page: notes from another
// clinic, old blood tests, x-rays, photos, PDFs and Word files
// (migration 189). Files marked "Owner sees" also show on the pet's page
// in the client app. Files the owner sends on WhatsApp are filed here from
// the chat (FileToRecordButton → "Pet's history").
//
// `adding` / `onAddingChange` let the patient page's own "📁 History /
// results" button open the upload form.

import { useEffect, useRef, useState } from 'react';
import { uploadPatientHistoryFile } from '@/lib/attachments';
import { HISTORY_CATEGORIES, historyCategory, historyFileKind } from '@/lib/patientHistoryFiles';

const KIND_ICON = { image: '🖼️', pdf: '📕', word: '📘', file: '📄' };
const ACCEPT = '.pdf,.doc,.docx,.rtf,.txt,.xls,.xlsx,.csv,image/*';

function formatDate(iso) {
  if (!iso) return null;
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function PatientHistoryFiles({ patientId, adding, onAddingChange }) {
  const [files, setFiles] = useState(null);
  const [picked, setPicked] = useState([]);
  const [form, setForm] = useState({ title: '', category: 'outside_history', document_date: '', share_with_owner: true });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const sectionRef = useRef(null);
  const inputRef = useRef(null);

  function load() {
    fetch(`/api/patients/${patientId}/history-files`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setFiles(Array.isArray(data) ? data : []))
      .catch(() => setFiles([]));
  }

  useEffect(load, [patientId]);

  useEffect(() => {
    if (adding) sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [adding]);

  function close() {
    setPicked([]);
    setError(null);
    setForm({ title: '', category: 'outside_history', document_date: '', share_with_owner: true });
    if (inputRef.current) inputRef.current.value = '';
    onAddingChange?.(false);
  }

  async function upload(e) {
    e.preventDefault();
    if (picked.length === 0 || uploading) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of picked) {
        await uploadPatientHistoryFile(patientId, file, {
          title: picked.length === 1 ? form.title : '',
          category: form.category,
          document_date: form.document_date || null,
          share_with_owner: form.share_with_owner,
        });
      }
      close();
      load();
    } catch (err) {
      setError(err.message);
      load();
    } finally {
      setUploading(false);
    }
  }

  async function update(row, changes) {
    setFiles((prev) => prev.map((f) => (f.id === row.id ? { ...f, ...changes } : f)));
    const res = await fetch(`/api/patient-history-files/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (!res.ok) load();
  }

  async function remove(row) {
    if (!window.confirm(`Remove "${row.title || row.file_name}" from this patient's history?`)) return;
    const res = await fetch(`/api/patient-history-files/${row.id}`, { method: 'DELETE' });
    if (res.ok) setFiles((prev) => prev.filter((f) => f.id !== row.id));
  }

  if (files === null) return null;
  if (files.length === 0 && !adding) return null;

  return (
    <section className="card history-files" ref={sectionRef}>
      <div className="page-header">
        <h3>📁 Outside history &amp; results {files.length > 0 && <small>({files.length})</small>}</h3>
        <div className="page-header-actions">
          {!adding && (
            <button type="button" className="button-link" onClick={() => onAddingChange?.(true)}>
              + Add files
            </button>
          )}
        </div>
      </div>

      {adding && (
        <form className="history-files-form" onSubmit={upload}>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            onChange={(e) => setPicked(Array.from(e.target.files || []))}
          />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {HISTORY_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
          <label className="history-files-inline">
            Dated
            <input type="date" value={form.document_date} onChange={(e) => setForm({ ...form, document_date: e.target.value })} />
          </label>
          {picked.length <= 1 && (
            <input
              placeholder="Title (e.g. Bloods from Blue Oasis, Jan 2025)"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          )}
          <label className="history-files-inline">
            <input
              type="checkbox"
              checked={form.share_with_owner}
              onChange={(e) => setForm({ ...form, share_with_owner: e.target.checked })}
            />
            Owner sees it in the app
          </label>
          <button type="submit" disabled={picked.length === 0 || uploading}>
            {uploading ? 'Uploading…' : picked.length > 1 ? `Upload ${picked.length} files` : 'Upload'}
          </button>
          <button type="button" className="history-files-cancel" onClick={close} disabled={uploading}>
            Cancel
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      )}

      {files.length > 0 && (
        <ul className="history-files-list">
          {files.map((row) => {
            const cat = historyCategory(row.category);
            return (
              <li key={row.id}>
                <a href={row.url} target="_blank" rel="noopener noreferrer" className="history-files-name">
                  {KIND_ICON[historyFileKind(row)]} {row.title || row.file_name}
                </a>
                <button
                  type="button"
                  className={`history-files-share${row.share_with_owner ? ' on' : ''}`}
                  onClick={() => update(row, { share_with_owner: !row.share_with_owner })}
                  title={row.share_with_owner ? 'Shown to the owner in the client app; click to hide it' : 'Hidden from the owner; click to show it in the client app'}
                >
                  {row.share_with_owner ? '👁 Owner sees' : '🔒 Staff only'}
                </button>
                <button type="button" className="history-files-remove" onClick={() => remove(row)} title="Remove">
                  ×
                </button>
                <span className="visit-meta">
                  {cat.icon} {cat.label}
                  {row.document_date ? ` · ${formatDate(row.document_date)}` : ` · added ${formatDate(row.created_at)}`}
                  {row.source === 'whatsapp' ? ' · from WhatsApp' : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
