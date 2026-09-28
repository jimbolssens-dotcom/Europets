// app/(admin)/accounting/legacy-payments/page.jsx
// Every payment logged against a client's old-system balance (migration
// 069's legacy_outstanding_balance), across all clients — when, how much,
// and to which client. Recorded from each client's own page (see
// app/(admin)/clients/[id]/page.jsx's "Old system balance" section); this
// is the accounting-wide view onto that log, the same relationship
// app/(admin)/accounting/staff-expenses has to the main Expenses page.

'use client';

import { useEffect, useState } from 'react';
import { formatShortDate } from '@/lib/formatTimestamp';

function money(n) {
  return Number(n || 0).toFixed(2);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function LegacyPaymentsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/accounting/legacy-payments${showAllMonths ? '' : `?month=${month}`}`)
      .then((res) => res.json())
      .then((data) => {
        setPayments(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, [month, showAllMonths]);

  const total = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h1>Old System Payments</h1>
        <a href="/accounting" className="button-link">
          ← Accounting
        </a>
        <a href="/accounting/legacy-payments-import" className="button-link">
          📥 Bulk-Import
        </a>
      </div>
      <p className="accounting-stat-hint">
        Every payment logged against a client&apos;s carried-over old-system balance — counted in the P&amp;L&apos;s
        Net Profit, kept separate from VAT since it&apos;s not a fresh taxable supply. Record a new one from the
        client&apos;s own page, under &quot;Old system balance.&quot;
      </p>

      <label>
        Month:{' '}
        <input
          type="month"
          value={month}
          disabled={showAllMonths}
          onChange={(e) => setMonth(e.target.value)}
        />
      </label>{' '}
      <label>
        <input
          type="checkbox"
          checked={showAllMonths}
          onChange={(e) => setShowAllMonths(e.target.checked)}
        />{' '}
        Show all months
      </label>

      <p className="visit-meta">
        AED {money(total)} logged{showAllMonths ? '' : ' this month'}
        {payments.length > 0 ? ` · ${payments.length} payment${payments.length === 1 ? '' : 's'}` : ''}
      </p>

      {loading ? (
        <p>Loading...</p>
      ) : payments.length === 0 ? (
        <p>No old-system payments logged{showAllMonths ? ' yet' : ' this month'}.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Origin</th>
              <th>Note</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{formatShortDate(p.paid_at)}</td>
                <td>
                  {p.client_id ? (
                    <a href={`/clients/${p.client_id}`}>
                      {p.clients?.full_name || 'Unknown client'}
                      {p.clients?.client_number ? ` (#${p.clients.client_number})` : ''}
                    </a>
                  ) : (
                    p.clients?.full_name || 'Unknown client'
                  )}
                </td>
                <td>{p.payment_method || '—'}</td>
                <td>{p.note || '—'}</td>
                <td>AED {money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
