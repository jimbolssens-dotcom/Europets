// app/(admin)/accounting/legacy-payments-import/page.jsx
// Bulk-import old-system payment records into legacy_payments from a
// pasted or uploaded export (e.g. the old system's own transfer log) —
// many rows in one pass instead of one-by-one through a client's own
// "Record payment" form, and without ever hand-writing SQL for it (the
// same reasoning as ./legacy-balance-corrections). Always preview
// before apply: nothing is written until you've seen exactly what would
// be added and confirmed it. Never touches a client's old-system
// balance (legacy_outstanding_balance) — this only adds to the payment
// log itself. See app/api/accounting/legacy-payments-import.

'use client';

import { useState } from 'react';

function money(n) {
  return Number(n || 0).toFixed(2);
}

// One row per line: client_number, amount, paid_at (YYYY-MM-DD), and an
// optional note — tab-separated, since a note can itself contain commas
// or runs of spaces (unlike the balance-corrections paste, which is just
// two plain numbers). Matches what a spreadsheet export gives you when
// columns are copied straight across, or a saved .tsv file.
function parseRows(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const parts = line.split('\t');
      return {
        client_number: (parts[0] || '').trim(),
        amount: (parts[1] || '').trim(),
        paid_at: (parts[2] || '').trim(),
        note: (parts[3] || '').trim(),
      };
    });
}

const STATUS_LABELS = {
  ready: 'Ready',
  duplicate_in_batch: 'Skipped — duplicate within this batch',
  already_imported: 'Skipped — already in the payment log',
  not_found: 'Not found — no client with this number',
  invalid: 'Invalid row',
};

export default function LegacyPaymentsImportPage() {
  const [text, setText] = useState('');
  const [results, setResults] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState(null);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result || ''));
      setResults(null);
      setApplied(false);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function preview() {
    const rows = parseRows(text);
    if (rows.length === 0) {
      setError('Paste or upload at least one row first.');
      return;
    }
    setError(null);
    setApplied(false);
    setPreviewing(true);
    const res = await fetch('/api/accounting/legacy-payments-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, apply: false }),
    });
    const data = await res.json().catch(() => ({}));
    setPreviewing(false);
    if (!res.ok) {
      setError(data.error || 'Failed to look up those rows');
      return;
    }
    setResults(data.results);
  }

  async function apply() {
    const rows = parseRows(text);
    setError(null);
    setApplying(true);
    const res = await fetch('/api/accounting/legacy-payments-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, apply: true }),
    });
    const data = await res.json().catch(() => ({}));
    setApplying(false);
    if (data.results) setResults(data.results);
    if (!res.ok) {
      setError(data.error || 'Failed to apply the import');
      if (!data.results) return;
    }
    setApplied(true);
  }

  const readyCount = results ? results.filter((r) => r.status === 'ready').length : 0;
  const appliedCount = results ? results.filter((r) => r.applied).length : 0;
  const skippedCount = results
    ? results.filter((r) => r.status === 'duplicate_in_batch' || r.status === 'already_imported').length
    : 0;
  const problemCount = results ? results.filter((r) => r.status === 'not_found' || r.status === 'invalid').length : 0;

  return (
    <div>
      <div className="page-header">
        <h1>Bulk-Import Old System Payments</h1>
        <a href="/accounting/legacy-payments" className="button-link">
          ← Old System Payments
        </a>
      </div>
      <p className="accounting-stat-hint">
        Paste or upload a client_number, amount, date paid (YYYY-MM-DD), and optional note per row —
        tab-separated, one row per line. Rows that repeat exactly within the batch, or that match a
        payment already logged for that client, are skipped automatically rather than double-counted.
        This only adds to the payment log — it never changes anyone&apos;s old-system balance. Nothing
        is written until you preview it below and click Apply.
      </p>

      <p>
        <input type="file" accept=".tsv,.csv,.txt" onChange={handleFile} />
      </p>

      <textarea
        rows={10}
        style={{ width: '100%', maxWidth: '48rem', fontFamily: 'monospace' }}
        placeholder={'10577\t95.78\t2026-01-27\t120484 - 95.78Aed'}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResults(null);
          setApplied(false);
        }}
      />
      <p>
        <button type="button" onClick={preview} disabled={previewing}>
          {previewing ? 'Looking up...' : 'Preview'}
        </button>
      </p>

      {error && <p className="error">{error}</p>}

      {results && (
        <>
          <p className="visit-meta">
            {applied ? (
              <>
                {appliedCount} payment{appliedCount === 1 ? '' : 's'} added
                {skippedCount > 0 && `, ${skippedCount} skipped`}
                {problemCount > 0 && `, ${problemCount} couldn't be matched`}
              </>
            ) : (
              <>
                {readyCount} row{readyCount === 1 ? '' : 's'} ready to import
                {skippedCount > 0 && `, ${skippedCount} will be skipped (duplicates)`}
                {problemCount > 0 && `, ${problemCount} couldn't be matched`}
              </>
            )}
          </p>
          <table>
            <thead>
              <tr>
                <th>Client #</th>
                <th>Client</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Note</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.index} className={r.status === 'not_found' || r.status === 'invalid' ? 'error' : undefined}>
                  <td>{r.client_number ?? '—'}</td>
                  <td>{r.full_name || '—'}</td>
                  <td>{Number.isFinite(r.amount) ? `AED ${money(r.amount)}` : '—'}</td>
                  <td>{r.paid_at || '—'}</td>
                  <td>{r.note || '—'}</td>
                  <td>
                    {applied && r.status === 'ready'
                      ? r.applied
                        ? '✅ Added'
                        : `❌ Failed${r.error ? ` — ${r.error}` : ''}`
                      : `${STATUS_LABELS[r.status] || r.status}${r.error ? ` — ${r.error}` : ''}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!applied && readyCount > 0 && (
            <p>
              <button type="button" onClick={apply} disabled={applying}>
                {applying ? 'Applying...' : `Import ${readyCount} Payment${readyCount === 1 ? '' : 's'}`}
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}
