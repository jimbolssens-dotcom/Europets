'use client';

// app/_components/CatteryInvoiceButton.jsx
// The stay's invoice, on the cattery booking's top line: a link to it once
// linked; otherwise "Create invoice" (boarding nights for this cat and any
// of the owner's other cats staying with it, see
// app/api/cattery/[id]/invoice) or "Link" to attach one already made by
// hand.

import { useEffect, useState } from 'react';
import { invoiceLabel } from '@/lib/paymentReminders';

const money = (n) => Number(n || 0).toFixed(2);

export default function CatteryInvoiceButton({ bookingId, canCreate }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function load() {
    return fetch(`/api/cattery/${bookingId}/invoice`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setInfo(data.error ? null : data));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  async function post(body) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/cattery/${bookingId}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not update the invoice.');
    if (!('invoice_id' in body) && data.invoice_id) {
      window.location.href = `/invoices/${data.invoice_id}`;
      return;
    }
    load();
  }

  if (!info) return null;

  if (info.invoice) {
    return (
      <span className="cattery-invoice">
        <a className="button-link" href={`/invoices/${info.invoice.id}`}>
          🧾 {invoiceLabel(info.invoice)}
          {info.invoice.status === 'paid' ? (
            <>
              {' ✓'}
              <span className="phone-hide"> paid</span>
            </>
          ) : (
            ''
          )}
        </a>
        <button
          type="button"
          className="cattery-invoice-unlink phone-hide"
          title="Unlink this invoice from the booking"
          disabled={busy}
          onClick={() => confirm('Unlink this invoice from the booking? The invoice itself stays.') && post({ invoice_id: null })}
        >
          ×
        </button>
      </span>
    );
  }

  return (
    <span className="cattery-invoice">
      {canCreate && (
        <button type="button" className="button-link" disabled={busy} onClick={() => post({})}>
          {busy ? (
            'Creating…'
          ) : (
            <>
              🧾 Create<span className="phone-hide"> invoice</span>
            </>
          )}
        </button>
      )}
      {info.choices.length > 0 && (
        <details className="cattery-invoice-link">
          <summary>
            Link<span className="phone-hide"> invoice</span>
          </summary>
          <div className="cattery-invoice-choices">
            {info.choices.map((inv) => (
              <button key={inv.id} type="button" disabled={busy} onClick={() => post({ invoice_id: inv.id })}>
                {invoiceLabel(inv)} · AED {money(inv.total)} · {inv.status.replace('_', ' ')} ·{' '}
                {new Date(inv.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </button>
            ))}
          </div>
        </details>
      )}
      {error && <span className="error">{error}</span>}
    </span>
  );
}
