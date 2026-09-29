// app/accounting/database-backup/page.jsx
// One button: downloads a full backup of every table in the database as a
// ZIP file (see app/api/accounting/database-backup). An independent,
// offline copy for disaster recovery — not a live failover system (see the
// on-site-backup conversation this came out of: a real local failover
// would need its own running database and a safe conflict-resolution
// story for reconnecting, which is a much bigger project than this).

'use client';

import { useState } from 'react';

export default function DatabaseBackupPage() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [lastDownloaded, setLastDownloaded] = useState(null);

  async function downloadBackup() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/accounting/database-backup');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate backup');
      }
      const disposition = res.headers.get('Content-Disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'europets-backup.zip';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setLastDownloaded(new Date());
    } catch (err) {
      setError(err.message);
    }
    setGenerating(false);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Database Backup</h1>
        <a href="/accounting" className="button-link">
          ← Accounting
        </a>
      </div>

      <div className="card">
        <p className="visit-meta">
          Downloads every client, patient, appointment, invoice, and other record in the clinic&apos;s database as
          one ZIP file — a JSON file per table, plus a short summary. This is an independent, offline copy for
          emergencies (a mistake, an account problem, ...), not a live backup that stays automatically up to
          date — it&apos;s only as current as the moment you click the button.
        </p>
        <p className="visit-meta">
          It does <strong>not</strong> include the actual photo/PDF/audio files (those stay in Supabase Storage) —
          only the records that reference them.
        </p>
        <p className="visit-meta">
          <strong>This file contains the clinic&apos;s complete client and financial data.</strong> Save it
          somewhere secure on this computer — not a shared drive, not emailed — and delete older copies once a
          newer one exists.
        </p>

        {error && <p className="error">{error}</p>}

        <button type="button" onClick={downloadBackup} disabled={generating}>
          {generating ? 'Generating backup… this can take up to a minute' : '⬇️ Download Full Backup'}
        </button>

        {lastDownloaded && (
          <p className="visit-meta">
            Last downloaded this session at {lastDownloaded.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
          </p>
        )}
      </div>
    </div>
  );
}
