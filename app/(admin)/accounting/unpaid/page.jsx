// app/accounting/unpaid/page.jsx
// Unpaid invoices, oldest first, with enough client contact info to chase
// a reminder in one click — reuses the same wa.me deep-link approach as
// the Intake page's "Share via WhatsApp" (opens WhatsApp with a prefilled
// message; nothing is sent server-side, no delivery tracking, matching
// how basic this accounting module is meant to stay).

'use client';

import { useEffect, useState } from 'react';

function money(n) {
  return Number(n || 0).toFixed(2);
}

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function reminderMessage(inv) {
  const number = inv.invoice_number ? `INV-${String(inv.invoice_number).padStart(6, '0')}` : 'your invoice';
  return `Hi ${inv.clients?.full_name || ''}, this is a friendly reminder from Europets Clinic that ${number} for AED ${money(inv.total)} is still outstanding. Please let us know if you have any questions. Thank you!`;
}

export default function UnpaidInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/invoices?status=unpaid')
      .then((res) => res.json())
      .then((data) => {
        const sorted = Array.isArray(data)
          ? [...data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
          : [];
        setInvoices(sorted);
        setLoading(false);
      });
  }, []);

  function remind(inv) {
    const phone = (inv.clients?.phone || '').replace(/\D/g, '');
    if (!phone) return;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(reminderMessage(inv))}`, '_blank');
  }

  const total = invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);

  return (
    <div>
      <p>
        <a href="/accounting">&larr; Accounting</a>
      </p>
      <h1>Unpaid Invoices</h1>
      <p className="visit-meta">
        {invoices.length} unpaid, AED {money(total)} outstanding, oldest first.
      </p>

      {loading ? (
        <p>Loading...</p>
      ) : invoices.length === 0 ? (
        <p>No unpaid invoices.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Client</th>
              <th>Phone</th>
              <th>Total</th>
              <th>Days Outstanding</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>
                  <a href={`/invoices/${inv.id}`}>
                    {inv.invoice_number ? `INV-${String(inv.invoice_number).padStart(6, '0')}` : inv.id.slice(0, 8)}
                  </a>
                </td>
                <td>{inv.clients?.full_name}</td>
                <td>{inv.clients?.phone || '—'}</td>
                <td>AED {money(inv.total)}</td>
                <td>{daysSince(inv.created_at)}</td>
                <td>
                  <button type="button" onClick={() => remind(inv)} disabled={!inv.clients?.phone}>
                    Remind via WhatsApp
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
