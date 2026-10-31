// app/_components/InvoicePaymentPanel.jsx
// Balance summary + "log a payment" form + payment history log for one
// invoice, shared between the invoices list cards and the invoice detail
// page. An invoice only ever becomes 'paid' by logged payments adding up
// to the total (see app/api/invoices/[id]/payments) — there's no direct
// "Mark Paid" button anymore, so the status can't drift from what was
// actually collected. A payment's method can be corrected afterwards, even
// on a paid invoice (✎ Method), and the line then shows what it was.
//
// A deposit (Jim: let clients pay ahead, even before the invoice is
// complete) is a payment with "Keep the extra as credit" ticked: it can be
// more than the balance, the extra shows as "In credit", and it can be
// added to an invoice that's already in credit. It never closes the
// consult or stay; the payment that settles the final bill does.
//
// Credit left on a finished case moves to the client's next unpaid invoice
// (lib/invoiceCreditCarry.js): deposits on their own, any other credit when
// staff press "Move to next invoice". Moves show in the list both ends.

'use client';

import { useState } from 'react';
import { formatDateTime } from '@/lib/formatTimestamp';

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  payment_link: 'Payment Link',
  nomod: 'Nomod',
  paymob: 'PayMob',
  paypal: 'PayPal',
};

// What a logged payment's method can be corrected to
// (app/api/invoices/[id]/payments/[paymentId], PATCH).
const CORRECTABLE_METHODS = ['cash', 'card', 'bank_transfer', 'payment_link'];

function money(n) {
  return Number(n || 0).toFixed(2);
}

export default function InvoicePaymentPanel({ invoice, staff = [], onChanged, onSendPaymentLink }) {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [note, setNote] = useState('');
  const [deposit, setDeposit] = useState(false);
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveMessage, setMoveMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [confirmingVoid, setConfirmingVoid] = useState(false);
  const [removingPaymentId, setRemovingPaymentId] = useState(null);
  const [confirmingRemovePaymentId, setConfirmingRemovePaymentId] = useState(null);
  const [error, setError] = useState(null);
  const [changingMethodId, setChangingMethodId] = useState(null);
  const [newMethod, setNewMethod] = useState('');
  const [savingMethod, setSavingMethod] = useState(false);

  const balanceDue = Math.max(
    0,
    Math.round((Number(invoice.total) - Number(invoice.amount_paid || 0)) * 100) / 100
  );
  const payments = invoice.payments || [];
  const credit = Math.max(0, Math.round((Number(invoice.amount_paid || 0) - Number(invoice.total)) * 100) / 100);
  const owing = invoice.status === 'unpaid' || invoice.status === 'partially_paid';
  // Paid up (or in credit): only a deposit can still be added, on request.
  const canTakePayment = owing || (invoice.status === 'paid' && showDepositForm);
  const canRemovePayments = owing || credit > 0;
  const transfers = invoice.credit_transfers || [];

  async function moveCredit() {
    setMoving(true);
    setError(null);
    setMoveMessage(null);
    const by = staff.find((s) => s.id === receivedBy)?.full_name || 'Staff';
    const res = await fetch(`/api/invoices/${invoice.id}/carry-credit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ by }),
    });
    const data = await res.json().catch(() => ({}));
    setMoving(false);
    if (!res.ok) {
      setError(data.error || 'Could not move the credit');
      return;
    }
    if (data.message) setMoveMessage(data.message);
    onChanged();
  }

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
        note: note.trim() || undefined,
        deposit: deposit || !owing,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to log payment');
    } else {
      setAmount('');
      setPaymentMethod('');
      setReceivedBy('');
      setNote('');
      setDeposit(false);
      setShowDepositForm(false);
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

  async function saveMethod(paymentId) {
    if (!newMethod) return;
    setSavingMethod(true);
    setError(null);
    const res = await fetch(`/api/invoices/${invoice.id}/payments/${paymentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_method: newMethod }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingMethod(false);
    if (!res.ok) {
      setError(data.error || 'Failed to change the payment method');
      return;
    }
    setChangingMethodId(null);
    onChanged();
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
          {credit > 0 && (
            <span className="invoice-credit">
              {' '}
              · In credit: <strong>AED {money(credit)}</strong>
            </span>
          )}
          {credit > 0 && (
            <button type="button" className="invoice-deposit-btn" onClick={moveCredit} disabled={moving} title="Move the credit to this client's unpaid invoices, oldest first">
              {moving ? 'Moving…' : 'Move to next invoice'}
            </button>
          )}
          {invoice.status === 'paid' && !showDepositForm && (
            <button type="button" className="invoice-deposit-btn" onClick={() => setShowDepositForm(true)}>
              + Deposit
            </button>
          )}
        </p>
      )}
      {moveMessage && <p className="visit-meta">{moveMessage}</p>}
      {transfers.length > 0 && (
        <ul className="invoice-payments-list invoice-credit-transfers">
          {transfers.map((t) => (
            <li key={t.id}>
              <span className="invoice-payment-date">{formatDateTime(t.created_at)}</span>
              <span className="invoice-payment-amount">
                {t.direction === 'in' ? '' : '−'}AED {money(t.amount)}
              </span>
              <span>
                {t.direction === 'in' ? 'Credit from ' : 'Credit moved to '}
                <a href={`/invoices/${t.invoice_id}`}>INV-{String(t.invoice_number || '').padStart(6, '0')}</a>
              </span>
              <span className="invoice-payment-by">{t.created_by || ''}</span>
            </li>
          ))}
        </ul>
      )}

      {error && !canTakePayment && <p className="error">{error}</p>}
      {payments.length > 0 && (
        <ul className="invoice-payments-list">
          {payments.map((p) => (
            <li key={p.id}>
              <span className="invoice-payment-date">{formatDateTime(p.paid_at)}</span>
              <span className="invoice-payment-amount">AED {money(p.amount)}</span>
              {changingMethodId === p.id ? (
                <span className="invoice-payment-method-edit">
                  <select value={newMethod} onChange={(e) => setNewMethod(e.target.value)} aria-label="Correct payment method" disabled={savingMethod}>
                    {CORRECTABLE_METHODS.map((m) => (
                      <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => saveMethod(p.id)} disabled={savingMethod || newMethod === p.payment_method}>
                    {savingMethod ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" className="secondary" onClick={() => setChangingMethodId(null)} disabled={savingMethod}>
                    Cancel
                  </button>
                </span>
              ) : (
                <span>
                  {PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}
                  {p.method_corrected_from && (
                    <span className="invoice-payment-corrected" title={p.method_corrected_at ? `Corrected ${formatDateTime(p.method_corrected_at)}` : undefined}>
                      {' '}(was {PAYMENT_METHOD_LABELS[p.method_corrected_from] || p.method_corrected_from})
                    </span>
                  )}
                </span>
              )}
              <span className="invoice-payment-by">
                {p.donations
                  ? `Donation #${p.donations.donation_number}`
                  : p.staff?.full_name || (p.payment_method === 'payment_link' ? 'Online (Nomod)' : 'unassigned')}
              </span>
              {p.note && <span className="invoice-payment-note">“{p.note}”</span>}
              {invoice.status !== 'void' && changingMethodId !== p.id && (
                <button
                  type="button"
                  className="invoice-payment-method-btn"
                  onClick={() => {
                    setChangingMethodId(p.id);
                    setNewMethod(CORRECTABLE_METHODS.includes(p.payment_method) ? p.payment_method : 'card');
                    setError(null);
                  }}
                  title="Fix the payment method if it was logged wrong"
                >
                  ✎ Method
                </button>
              )}
              {canRemovePayments &&
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
              max={deposit || !owing ? undefined : balanceDue}
              placeholder={deposit || !owing ? 'Deposit amount' : `Amount (up to AED ${money(balanceDue)})`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {owing && (
              <label className="invoice-deposit-toggle" title="Take more than the balance; the extra stays on this invoice as credit until the bill catches up">
                <input type="checkbox" checked={deposit} onChange={(e) => setDeposit(e.target.checked)} />
                Keep the extra as credit (deposit)
              </label>
            )}
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
            <input
              type="text"
              placeholder="Note (optional) — e.g. balance due Friday"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="submit" disabled={submitting || !amount || !paymentMethod || !receivedBy}>
              {submitting ? 'Logging...' : 'Log'}
            </button>
            {owing && (
              <button
                type="button"
                onClick={payInFull}
                disabled={submitting || !paymentMethod || !receivedBy}
              >
                {submitting ? 'Logging...' : `Pay in Full (AED ${money(balanceDue)})`}
              </button>
            )}
            {!owing && (
              <button type="button" className="secondary" onClick={() => setShowDepositForm(false)}>
                Cancel
              </button>
            )}
            {onSendPaymentLink && (
              <button type="button" onClick={onSendPaymentLink}>
                💳 Payment Link
              </button>
            )}
          </form>
          {!owing ? null : confirmingVoid ? (
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
            // Rare, so a small grey link rather than a full button.
            <button type="button" className="invoice-void-link" onClick={() => setConfirmingVoid(true)}>
              Void invoice
            </button>
          )}
        </>
      )}
    </div>
  );
}
