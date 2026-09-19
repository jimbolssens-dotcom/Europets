// app/_components/InvoicePaymentPanel.jsx
// Balance summary + "log a payment" form + payment history log for one
// invoice, shared between the invoices list cards and the invoice detail
// page. An invoice only ever becomes 'paid' by logged payments adding up
// to the total (see app/api/invoices/[id]/payments) — there's no direct
// "Mark Paid" button anymore, so the status can't drift from what was
// actually collected.

'use client';

import { useState } from 'react';

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  payment_link: 'Payment Link',
  nomod: 'Nomod',
  paymob: 'PayMob',
  paypal: 'PayPal',
};

function money(n) {
  return Number(n || 0).toFixed(2);
}

export default function InvoicePaymentPanel({ invoice, staff = [], onChanged, onSendPaymentLink }) {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [confirmingVoid, setConfirmingVoid] = useState(false);
  const [removingPaymentId, setRemovingPaymentId] = useState(null);
  const [confirmingRemovePaymentId, setConfirmingRemovePaymentId] = useState(null);
  const [error, setError] = useState(null);

  const balanceDue = Math.max(
    0,
    Math.round((Number(invoice.total) - Number(invoice.amount_paid || 0)) * 100) / 100
  );
  const payments = invoice.payments || [];
  const canTakePayment = invoice.status === 'unpaid' || invoice.status === 'partially_paid';

  async function submitPayment(amt) {
    if (!amt || !paymentMethod || !receivedBy) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/invoices/${invoice.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amt,
        payment_method: paymentMethod,
        received_by: receivedBy,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to log payment');
    } else {
      setAmount('');
      setPaymentMethod('');
      setReceivedBy('');
      onChanged();
    }
    setSubmitting(false);
  }

  function logPayment(e) {
    e.preventDefault();
    submitPayment(Number(amount));
  }

  // The common case — no partial amount to type or work out, just the
  // whole remaining balance in one click once method/staff are picked.
  function payInFull() {
    submitPayment(balanceDue);
  }

  // Same inline-confirm reasoning as voidInvoice — no window.confirm()/alert().
  async function removePayment(paymentId) {
    setRemovingPaymentId(paymentId);
    setError(null);
    const res = await fetch(`/api/invoices/${invoice.id}/payments/${paymentId}`, { method: 'DELETE' });
    setRemovingPaymentId(null);
    setConfirmingRemovePaymentId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to remove payment');
      return;
    }
    onChanged();
  }

  // An inline confirm step instead of window.confirm() — a native confirm()
  // dialog can behave inconsistently across mobile browsers (silently
  // dismissed, or never shown at all in some embedded/webview contexts),
  // which looked exactly like "I press Void and nothing happens" with no
  // way to tell whether the click even registered.
  async function voidInvoice() {
    setVoiding(true);
    setError(null);
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'void' }),
    });
    setVoiding(false);
    setConfirmingVoid(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to void invoice');
      return;
    }
    onChanged();
  }

  return (
    <div className="invoice-payment-panel">
      {invoice.status !== 'void' && (
        <p className="invoice-balance-summary">
          Paid: <strong>AED {money(invoice.amount_paid)}</strong> of AED {money(invoice.total)}
          {balanceDue > 0 && (
            <>
              {' '}
              · Balance due: <strong>AED {money(balanceDue)}</strong>
            </>
          )}
        </p>
      )}

      {payments.length > 0 && (
        <ul className="invoice-payments-list">
          {payments.map((p) => (
            <li key={p.id}>
              <span className="invoice-payment-date">{new Date(p.paid_at).toLocaleString()}</span>
              <span className="invoice-payment-amount">AED {money(p.amount)}</span>
              <span>{PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}</span>
              <span className="invoice-payment-by">
                {p.donations
                  ? `Donation #${p.donations.donation_number}`
                  : p.staff?.full_name || (p.payment_method === 'payment_link' ? 'Online (Nomod)' : 'unassigned')}
              </span>
              {canTakePayment &&
                (confirmingRemovePaymentId === p.id ? (
                  <span className="invoice-payment-remove-confirm">
                    Remove this payment?{' '}
                    <button type="button" onClick={() => removePayment(p.id)} disabled={removingPaymentId === p.id}>
                      {removingPaymentId === p.id ? 'Removing...' : 'Yes'}
                    </button>{' '}
                    <button type="button" onClick={() => setConfirmingRemovePaymentId(null)} disabled={removingPaymentId === p.id}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmingRemovePaymentId(p.id)}>
                    Remove
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}

      {canTakePayment && (
        <>
          <form className="note-form" onSubmit={logPayment}>
            {error && <p className="error">{error}</p>}
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={balanceDue}
              placeholder={`Amount (up to AED ${money(balanceDue)})`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="">Paid via...</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="payment_link">Payment Link</option>
            </select>
            <select value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} required>
              <option value="">Received by...</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={submitting || !amount || !paymentMethod || !receivedBy}>
              {submitting ? 'Logging...' : 'Log'}
            </button>
            <button
              type="button"
              onClick={payInFull}
              disabled={submitting || !paymentMethod || !receivedBy}
            >
              {submitting ? 'Logging...' : `Pay in Full (AED ${money(balanceDue)})`}
            </button>
            {onSendPaymentLink && (
              <button type="button" onClick={onSendPaymentLink}>
                💳 Payment Link
              </button>
            )}
          </form>
          {confirmingVoid ? (
            <p className="invoice-void-confirm">
              Void this invoice? This cannot be undone.{' '}
              <button type="button" onClick={voidInvoice} disabled={voiding}>
                {voiding ? 'Voiding...' : 'Yes, void it'}
              </button>{' '}
              <button type="button" onClick={() => setConfirmingVoid(false)} disabled={voiding}>
                Cancel
              </button>
            </p>
          ) : (
            <button type="button" onClick={() => setConfirmingVoid(true)}>
              Void
            </button>
          )}
        </>
      )}
    </div>
  );
}
