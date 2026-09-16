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
//
// Every past shift is already permanently on record here (the data is
// invoice_payments, never deleted) and reachable just by picking a date —
// the Prev/Today/Next buttons below are a quick way to browse that
// history without hand-typing dates in the picker every time.

'use client';

import { useEffect, useState } from 'react';
import InfoHint from '@/app/_components/InfoHint';
import PdfPreviewModal from '@/app/_components/PdfPreviewModal';
import { printPdfUrl } from '@/lib/printPdf';

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

function shiftDate(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
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
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/shift-summary?date=${date}&shift=${shift}&cutoff=${cutoff}`)
      .then((res) => res.json())
      .then((data) => {
        setSummary(data);
        setLoading(false);
      });
  }, [date, shift, cutoff]);

  function printTally() {
    const url = `/api/shift-summary/pdf?date=${date}&shift=${shift}&cutoff=${cutoff}&t=${Date.now()}`;
    printPdfUrl(url, { onFallback: () => setPreviewPdfUrl(url) });
  }

  return (
    <div>
      <h1>
        Shift Tally{' '}
        <InfoHint>
          Every payment logged in the selected half-day — count it against the till before
          handover.
        </InfoHint>
      </h1>

      <div className="action-row">
        <div className="shift-tally-day-nav">
          <button type="button" onClick={() => setDate((d) => shiftDate(d, -1))} title="Previous day">
            ← Prev
          </button>
          <label>
            Date:{' '}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="button" onClick={() => setDate((d) => shiftDate(d, 1))} title="Next day">
            Next →
          </button>
          {date !== todayLocalDate() && (
            <button type="button" onClick={() => setDate(todayLocalDate())}>
              Today
            </button>
          )}
        </div>
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
        <button type="button" className="button-link" onClick={printTally} disabled={loading || !summary}>
          🖨️ Print
        </button>
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
              <table className="shift-tally-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Invoice</th>
                    <th>Client #</th>
                    <th>Client</th>
                    <th>Excl. VAT</th>
                    <th>VAT</th>
                    <th>Total</th>
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
                      <td>{p.invoices?.clients?.client_number ?? '—'}</td>
                      <td>{p.invoices?.clients?.full_name || '—'}</td>
                      <td>{money(p.excl_vat)}</td>
                      <td>{money(p.vat_amount)}</td>
                      <td>AED {money(p.amount)}</td>
                      <td>{PAYMENT_LABELS[p.payment_method] || p.payment_method}</td>
                      <td>{p.staff?.full_name || 'unassigned'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Total</td>
                    <td>{money(summary.vat.excl_vat)}</td>
                    <td>{money(summary.vat.vat_amount)}</td>
                    <td>AED {money(summary.total)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      <PdfPreviewModal url={previewPdfUrl} onClose={() => setPreviewPdfUrl(null)} />
    </div>
  );
}
