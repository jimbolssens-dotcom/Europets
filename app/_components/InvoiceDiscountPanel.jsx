// app/_components/InvoiceDiscountPanel.jsx
// "Apply a discount" form + discount history log for one invoice — a
// plain amount deducted from the final bill at checkout, logged for
// audit (see migrations/123, app/api/invoices/[id]/discounts). Mirrors
// InvoicePaymentPanel's list+form shape.

'use client';

import { useState } from 'react';

function money(n) {
  return Number(n || 0).toFixed(2);
}

export default function InvoiceDiscountPanel({ invoice, staff = [], onChanged }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [appliedBy, setAppliedBy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState(null);
  const [error, setError] = useState(null);

  const discounts = invoice.discounts || [];
  const remainingSubtotal = Math.max(
    0,
    Math.round((Number(invoice.subtotal) - Number(invoice.discount_amount || 0)) * 100) / 100
  );
  const canApplyDiscount = invoice.status === 'unpaid' || invoice.status === 'partially_paid';

  async function applyDiscount(e) {
    e.preventDefault();
    if (!amount || !appliedBy) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/invoices/${invoice.id}/discounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Number(amount),
        reason: reason || undefined,
        applied_by: appliedBy,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to apply discount');
    } else {
      setAmount('');
      setReason('');
      setAppliedBy('');
      onChanged();
    }
    setSubmitting(false);
  }

  async function removeDiscount(discountId) {
    setRemovingId(discountId);
    setError(null);
    const res = await fetch(`/api/invoices/${invoice.id}/discounts/${discountId}`, { method: 'DELETE' });
    setRemovingId(null);
    setConfirmingRemoveId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to remove discount');
      return;
    }
    onChanged();
  }

  return (
    <div className="invoice-discount-panel">
      {Number(invoice.discount_amount) > 0 && (
        <p className="invoice-balance-summary">
          Discounted: <strong>AED {money(invoice.discount_amount)}</strong> off AED {money(invoice.subtotal)}
        </p>
      )}

      {discounts.length > 0 && (
        <ul className="invoice-payments-list">
          {discounts.map((d) => (
            <li key={d.id}>
              <span className="invoice-payment-date">{new Date(d.applied_at).toLocaleString()}</span>
              <span className="invoice-payment-amount">AED {money(d.amount)}</span>
              <span>{d.reason || 'No reason given'}</span>
              <span className="invoice-payment-by">{d.staff?.full_name || 'unassigned'}</span>
              {canApplyDiscount &&
                (confirmingRemoveId === d.id ? (
                  <span className="invoice-payment-remove-confirm">
                    Remove this discount?{' '}
                    <button type="button" onClick={() => removeDiscount(d.id)} disabled={removingId === d.id}>
                      {removingId === d.id ? 'Removing...' : 'Yes'}
                    </button>{' '}
                    <button type="button" onClick={() => setConfirmingRemoveId(null)} disabled={removingId === d.id}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmingRemoveId(d.id)}>
                    Remove
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}

      {canApplyDiscount && (
        <form className="note-form" onSubmit={applyDiscount}>
          {error && <p className="error">{error}</p>}
          <input
            type="number"
            step="0.01"
            min="0.01"
            max={remainingSubtotal}
            placeholder={`Amount (up to AED ${money(remainingSubtotal)})`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            type="text"
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <select value={appliedBy} onChange={(e) => setAppliedBy(e.target.value)} required>
            <option value="">Applied by...</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={submitting || !amount || !appliedBy}>
            {submitting ? 'Applying...' : 'Apply Discount'}
          </button>
        </form>
      )}
    </div>
  );
}
