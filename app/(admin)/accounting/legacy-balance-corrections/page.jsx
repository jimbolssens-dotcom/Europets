// app/accounting/legacy-balance-corrections/page.jsx
// Bulk-correct clients.legacy_outstanding_balance from a pasted
// client_number + correct-balance list (e.g. copied straight from the
// old system's own export) — the same correction a single client's own
// "Correct this number" link makes (app/(admin)/clients/[id]), just for
// many clients in one pass instead of one-by-one, and without ever
// hand-writing SQL for it. Always preview before apply: nothing is
// written until you've seen exactly what would change and confirmed it.

'use client';

import { useState } from 'react';

function money(n) {
  return Number(n || 0).toFixed(2);
}

// Accepts a client_number and a balance per line, separated by a tab,
// comma, or run of spaces — covers pasting two columns straight out of
// Excel (tab-separated) as well as someone typing "10577, 34213" by hand.
function parseRows(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t|,|\s+/).map((p) => p.trim()).filter(Boolean);
      return { client_number: parts[0], balance: parts[1] };
    });
}

export default function LegacyBalanceCorrectionsPage() {
  const [text, setText] = useState('');
  const [results, setResults] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState(null);

  async function preview() {
    const rows = parseRows(text);
    if (rows.length === 0) {
      setError('Paste at least one client_number + balance line first.');
      return;
    }
    setError(null);
    setApplied(false);
    setPreviewing(true);
    const res = await fetch('/api/accounting/legacy-balance-corrections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, apply: false }),
    });
    const data = await res.json().catch(() => ({}));
    setPreviewing(false);
    if (!res.ok) {
      setError(data.error || 'Failed to look up those client numbers');
      return;
    }
    setResults(data.results);
  }

  async function apply() {
    const rows = parseRows(text);
    setError(null);
    setApplying(true);
    const res = await fetch('/api/accounting/legacy-balance-corrections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, apply: true }),
    });
    const data = await res.json().catch(() => ({}));
    setApplying(false);
    if (!res.ok) {
      setError(data.error || 'Failed to apply corrections');
      return;
    }
    setResults(data.results);
    setApplied(true);
  }

  const foundCount = results ? results.filter((r) => r.found).length : 0;
  const notFoundCount = results ? results.filter((r) => !r.found).length : 0;

  return (
    <div>
      <div className="page-header">
        <h1>Bulk-Correct Old System Balances</h1>
        <a href="/accounting" className="button-link">
          ← Accounting
        </a>
      </div>
      <p className="accounting-stat-hint">
        Paste each client&apos;s number and their correct old-system balance, one pair per line — a tab,
        comma, or space between them, so a two-column paste straight from Excel works as-is. Nothing is
        changed until you preview it below and click Apply.
      </p>

      <textarea
        rows={10}
        style={{ width: '100%', maxWidth: '32rem', fontFamily: 'monospace' }}
        placeholder={'10577\t34213\n1273\t3424.00\n30071\t1000'}
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
            {foundCount} client{foundCount === 1 ? '' : 's'} matched
            {notFoundCount > 0 && `, ${notFoundCount} not found`}
            {applied && ' — corrections applied below.'}
          </p>
          <table>
            <thead>
              <tr>
                <th>Client #</th>
                <th>Name</th>
                <th>Current Balance</th>
                <th>New Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className={!r.found ? 'error' : undefined}>
                  <td>{r.client_number}</td>
                  <td>{r.found ? r.full_name : '—'}</td>
                  <td>{r.found ? `AED ${money(r.current_balance)}` : '—'}</td>
                  <td>{r.found ? `AED ${money(r.new_balance)}` : '—'}</td>
                  <td>
                    {!r.found
                      ? `Not found — ${r.error}`
                      : applied
                        ? r.applied
                          ? '✅ Applied'
                          : `❌ Failed — ${r.error}`
                        : 'Ready'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!applied && foundCount > 0 && (
            <p>
              <button type="button" onClick={apply} disabled={applying}>
                {applying ? 'Applying...' : `Apply ${foundCount} Correction${foundCount === 1 ? '' : 's'}`}
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}
