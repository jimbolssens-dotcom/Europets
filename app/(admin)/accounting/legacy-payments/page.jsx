// app/(admin)/accounting/legacy-payments/page.jsx
// Every payment logged against a client's old-system balance (migration
// 069's legacy_outstanding_balance), across all clients — when, how much,
// and to which client. Recorded from each client's own page (see
// app/(admin)/clients/[id]/page.jsx's "Old system balance" section); this
// is the accounting-wide view onto that log, the same relationship
// app/(admin)/accounting/staff-expenses has to the main Expenses page.
//
// Sort toggle, Edit, and Delete mirror app/(admin)/accounting/donations —
// same layout, same on-blur-free inline-form pattern, just against
// legacy_payments/payment_number (migration 156) instead of
// donations/donation_number. Deleting or editing the amount here also
// reverses/re-applies its effect on the client's legacy_outstanding_balance
// (see app/api/accounting/legacy-payments/[id]/route.js) — unlike a
// donation, a legacy payment has no separate "apply to invoice" step, so
// that balance is its only side effect to keep in sync.

'use client';

import { Fragment, useEffect, useState } from 'react';
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
  const [methods, setMethods] = useState([]);
  // Sequence preferred over date, same default and reasoning as Online
  // Payments — tracks logging order rather than shuffling by a backdated
  // paid_at.
  const [sortBy, setSortBy] = useState('sequence');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState(null);

  function loadPayments() {
    setLoading(true);
    return fetch(`/api/accounting/legacy-payments${showAllMonths ? '' : `?month=${month}`}`)
      .then((res) => res.json())
      .then((data) => {
        setPayments(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }

  useEffect(() => {
    loadPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, showAllMonths]);

  useEffect(() => {
    fetch('/api/accounting/legacy-payment-methods')
      .then((res) => res.json())
      .then((data) => setMethods(Array.isArray(data) ? data : []));
  }, []);

  function startEdit(payment) {
    setEditingId(payment.id);
    setEditError(null);
    setEditForm({
      amount: String(payment.amount),
      payment_method: payment.payment_method || '',
      note: payment.note || '',
      paid_at: payment.paid_at,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
    setEditError(null);
  }

  async function saveEdit(payment) {
    if (!editForm.amount || !editForm.payment_method) return;
    setEditSubmitting(true);
    setEditError(null);

    const res = await fetch(`/api/accounting/legacy-payments/${payment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Number(editForm.amount),
        payment_method: editForm.payment_method,
        note: editForm.note || null,
        paid_at: editForm.paid_at,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setEditSubmitting(false);

    if (!res.ok) {
      setEditError(data.error || 'Failed to update payment');
      return;
    }
    cancelEdit();
    loadPayments();
  }

  async function deletePayment(payment) {
    if (!confirm(`Delete payment #${payment.payment_number || payment.id.slice(0, 8)}? This cannot be undone.`)) return;
    const res = await fetch(`/api/accounting/legacy-payments/${payment.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Failed to delete payment');
      return;
    }
    if (editingId === payment.id) cancelEdit();
    loadPayments();
  }

  const total = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // Payments imported before payment_number existed (migration 156) sort
  // to the end of sequence mode, oldest-logged first among themselves —
  // there's no number to rank them by, so date is the next best thing.
  const sortedPayments = [...payments].sort((a, b) => {
    if (sortBy === 'sequence') {
      if (a.payment_number && b.payment_number) return b.payment_number.localeCompare(a.payment_number);
      if (a.payment_number) return -1;
      if (b.payment_number) return 1;
    }
    return a.paid_at < b.paid_at ? 1 : a.paid_at > b.paid_at ? -1 : 0;
  });

  return (
    <div>
      <div className="page-header">
        <h1>Old System Payments</h1>
        <a href="/accounting" className="button-link">
          ← Accounting
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
        <>
          <label className="visit-meta">
            Sort by:{' '}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="sequence">Sequence number</option>
              <option value="date">Date received</option>
            </select>
          </label>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Client</th>
                <th>Origin</th>
                <th>Note</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedPayments.map((p) => (
                <Fragment key={p.id}>
                  <tr>
                    <td>{p.payment_number || '—'}</td>
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
                    <td>
                      <button type="button" onClick={() => (editingId === p.id ? cancelEdit() : startEdit(p))}>
                        {editingId === p.id ? 'Cancel' : 'Edit'}
                      </button>
                      <button type="button" onClick={() => deletePayment(p)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                  {editingId === p.id && (
                    <tr>
                      <td colSpan={7}>
                        <form
                          className="note-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            saveEdit(p);
                          }}
                        >
                          {editError && <p className="error">{editError}</p>}
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="Amount"
                            value={editForm.amount}
                            onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                          />
                          <select
                            value={editForm.payment_method}
                            onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value })}
                          >
                            <option value="">Received via...</option>
                            {methods.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={editForm.paid_at}
                            onChange={(e) => setEditForm({ ...editForm, paid_at: e.target.value })}
                          />
                          <input
                            placeholder="Note (optional)"
                            value={editForm.note}
                            onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                          />
                          <button
                            type="submit"
                            disabled={editSubmitting || !editForm.amount || !editForm.payment_method}
                          >
                            {editSubmitting ? 'Saving...' : 'Save Changes'}
                          </button>
                          <button type="button" className="secondary" onClick={cancelEdit} disabled={editSubmitting}>
                            Cancel
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
