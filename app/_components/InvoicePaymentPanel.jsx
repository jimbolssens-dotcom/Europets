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
};

function money(n) {
  return Number(n || 0).toFixed(2);
}

export default function InvoicePaymentPanel({ invoice, staff = [], onChanged }) {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [error, setError] = useState(null);

  const balanceDue = Math.max(
    0,
    Math.round((Number(invoice.total) - Number(invoice.amount_paid || 0)) * 100) / 100
  );
  const payments = invoice.payments || [];
  const canTakePayment = invoice.status === 'unpaid' || invoice.status === 'partially_paid';

  async function logPayment(e) {
    e.preventDefault();
    if (!amount || !paymentMethod || !receivedBy) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/invoices/${invoice.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Number(amount),
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

  async function removePayment(paymentId) {
    if (!confirm('Remove this payment? This cannot be undone.')) return;
    await fetch(`/api/invoices/${invoice.id}/payments/${paymentId}`, { method: 'DELETE' });
    onChanged();
  }

  async function voidInvoice() {
    if (!confirm('Void this invoice? This cannot be undone.')) return;
    setVoiding(true);
    await fetch(`/api/invoices/${invoice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'void' }),
    });
    setVoiding(false);
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
              <span className="invoice-payment-by">{p.staff?.full_name || 'unassigned'}</span>
              {canTakePayment && (
                <button type="button" onClick={() => removePayment(p.id)}>
                  Remove
                </button>
              )}
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
              {submitting ? 'Logging...' : 'Log Payment'}
            </button>
          </form>
          <button type="button" onClick={voidInvoice} disabled={voiding}>
            Void
          </button>
        </>
      )}
    </div>
  );
}
