// app/shift-tally/page.jsx
// Reception's end-of-shift till count: every payment logged this morning
// or this afternoon, broken down by payment method (so cash in the
// drawer can be checked against what the system says came in), plus the
// full list to catch anything missed or overcharged.
//
// Deliberately outside /accounting — reception runs this every shift and
// doesn't have the accounting password (see middleware.js), so this page
// and its API route (/api/shift-summary) stay unauthenticated, same as
// every other staff page in the app.

'use client';

import { useEffect, useState } from 'react';

const PAYMENT_LABELS = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  payment_link: 'Payment Link',
};

function money(n) {
  return Number(n || 0).toFixed(2);
}

function todayLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function currentShift(cutoff) {
  const now = new Date();
  const [h, m] = cutoff.split(':').map(Number);
  const cutoffMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes < cutoffMinutes ? 'morning' : 'afternoon';
}

export default function ShiftTallyPage() {
  const [date, setDate] = useState(todayLocalDate());
  const [cutoff, setCutoff] = useState('14:00');
  const [shift, setShift] = useState(() => currentShift('14:00'));
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/shift-summary?date=${date}&shift=${shift}&cutoff=${cutoff}`)
      .then((res) => res.json())
      .then((data) => {
        setSummary(data);
        setLoading(false);
      });
  }, [date, shift, cutoff]);

  return (
    <div>
      <h1>Shift Tally</h1>
      <p className="visit-meta">
        Every payment logged in the selected half-day — count it against the till before handover.
      </p>

      <div className="action-row">
        <label>
          Date:{' '}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Shift:{' '}
          <select value={shift} onChange={(e) => setShift(e.target.value)}>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
          </select>
        </label>
        <label>
          Cutoff:{' '}
          <input type="time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
        </label>
      </div>

      {loading || !summary ? (
        <p>Loading...</p>
      ) : (
        <>
          <div className="accounting-stat-grid">
            <div className="accounting-stat">
              <span className="accounting-stat-label">Total Collected</span>
              <span className="accounting-stat-value">AED {money(summary.total)}</span>
              <span className="accounting-stat-hint">
                {summary.count} payment{summary.count === 1 ? '' : 's'}
              </span>
            </div>
            {Object.entries(summary.totals_by_method).map(([method, { total, count }]) => (
              <div className="accounting-stat" key={method}>
                <span className="accounting-stat-label">{PAYMENT_LABELS[method] || method}</span>
                <span className="accounting-stat-value">AED {money(total)}</span>
                <span className="accounting-stat-hint">
                  {count} payment{count === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>

          <h3>Payment Log</h3>
          {summary.payments.length === 0 ? (
            <p>No payments logged in this window.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Invoice</th>
                    <th>Client</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Received By</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{new Date(p.paid_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>
                        {p.invoices?.invoice_number ? (
                          <a href={`/invoices/${p.invoice_id}`}>
                            INV-{String(p.invoices.invoice_number).padStart(6, '0')}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{p.invoices?.clients?.full_name || '—'}</td>
                      <td>AED {money(p.amount)}</td>
                      <td>{PAYMENT_LABELS[p.payment_method] || p.payment_method}</td>
                      <td>{p.staff?.full_name || 'unassigned'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
