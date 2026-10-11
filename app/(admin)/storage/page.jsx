// app/(admin)/storage/page.jsx
// Storage (Settings > More): how full the clinic's Supabase plan is, as
// two filling bars (files: photos, x-rays, documents, recordings; and the
// database: all the records), what the files are, and how far the photo
// compression sweep has got. Data from GET /api/storage-usage.

'use client';

import { useEffect, useState } from 'react';

const FOLDER_LABEL = {
  hospitalization_note: 'Hospital worksheet photos',
  hospitalization: 'Hospital stay photos',
  recordings: 'Recordings',
  expense: 'Expense receipts',
  dental_report: 'Dental reports',
  surgical_report: 'Surgical reports',
  diagnostic: 'Test results',
  visit: 'Consult photos',
  xray_report: 'X-ray reports',
  ultrasound_report: 'Ultrasound reports',
  gastroscopy_report: 'Gastroscopy reports',
  cattery_log: 'Cattery photos',
  whatsapp: 'WhatsApp media',
  client: 'Client files',
  client_message: 'Chat attachments',
};

function size(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function UsageBar({ label, used, limit, detail }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const level = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : 'ok';
  return (
    <div className="storage-usage card">
      <div className="storage-usage-head">
        <strong>{label}</strong>
        <span>
          {size(used)} of {size(limit)} · <b>{pct < 1 ? pct.toFixed(1) : Math.round(pct)}%</b>
        </span>
      </div>
      <div className="storage-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={`${label} used`}>
        <div className={`storage-bar-fill ${level}`} style={{ width: `${Math.max(pct, 0.6)}%` }} />
      </div>
      {detail && <p className="visit-meta">{detail}</p>}
    </div>
  );
}

export default function StoragePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/storage-usage', { cache: 'no-store' })
      .then((res) => res.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError('Could not load storage usage.'));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Storage</h1>
        <div className="page-header-actions">
          <a href="/settings">← Settings</a>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {!data && !error && <p>Loading…</p>}
      {data && (
        <>
          <UsageBar
            label="Files"
            used={data.files_bytes}
            limit={data.files_limit_bytes}
            detail={`${data.files_count.toLocaleString()} photos, x-rays, documents and recordings`}
          />
          <UsageBar label="Database" used={data.database_bytes} limit={data.database_limit_bytes} detail="All records: clients, patients, consults, invoices, messages…" />
          <p className="visit-meta">
            Measured against what the Supabase Pro plan includes. Going over isn&apos;t a hard stop; Supabase charges for the extra.
          </p>

          <h2>What the files are</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Type</th><th>Files</th><th>Size</th><th>Share</th></tr>
              </thead>
              <tbody>
                {data.by_folder.map((f) => (
                  <tr key={f.folder}>
                    <td>{FOLDER_LABEL[f.folder] || f.folder}</td>
                    <td>{f.files.toLocaleString()}</td>
                    <td className="storage-nowrap">{size(f.bytes)}</td>
                    <td>{data.files_bytes ? Math.round((f.bytes / data.files_bytes) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Photo compression</h2>
          <p>
            {data.photos_compressed.toLocaleString()} photos compressed to about 300 KB (x-rays about 900 KB).
            {data.photos_waiting > 0
              ? ` ${data.photos_waiting.toLocaleString()} more waiting; a batch is done every 10 minutes.`
              : ' Nothing waiting.'}
          </p>
          <p className="visit-meta">Photos on open consults and hospital stays stay full size until the case is closed.</p>
        </>
      )}
    </div>
  );
}
