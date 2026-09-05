// app/accounting/unpaid/page.jsx
// Unpaid invoices, oldest first, with enough client contact info to chase
// a reminder in one click — reuses the same wa.me deep-link approach as
// the Intake page's "Share via WhatsApp" (opens WhatsApp with a prefilled
// message; nothing is sent server-side, no delivery tracking, matching
// how basic this accounting module is meant to stay).

'use client';

import { useEffect, useState } from 'react';
import { money, balanceDue, invoiceLabel, openWhatsAppReminder, openEmailReminder } from '@/lib/paymentReminders';

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function UnpaidInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/invoices?status=unpaid,partially_paid')
      .then((res) => res.json())
      .then((data) => {
        const sorted = Array.isArray(data)
          ? [...data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
          : [];
        setInvoices(sorted);
        setLoading(false);
      });
  }, []);

  function remindViaWhatsApp(inv) {
    openWhatsAppReminder(inv.clients?.phone, inv.clients?.full_name, [inv]);
  }

  function remindViaEmail(inv) {
    openEmailReminder(inv.clients?.email, inv.clients?.full_name, [inv]);
  }

  const total = invoices.reduce((sum, inv) => sum + balanceDue(inv), 0);

  return (
    <div>
      <div className="page-header">
        <h1>Unpaid Invoices</h1>
        <a href="/accounting" className="button-link">
          &larr; Accounting
        </a>
      </div>
      <p className="visit-meta">
        {invoices.length} unpaid or partially paid, AED {money(total)} outstanding, oldest first.
      </p>

      {loading ? (
        <p>Loading...</p>
      ) : invoices.length === 0 ? (
        <p>No unpaid or partially paid invoices.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Client</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Balance Due</th>
              <th>Days Outstanding</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>
                  <a href={`/invoices/${inv.id}`}>{invoiceLabel(inv)}</a>
                </td>
                <td>{inv.clients?.full_name}</td>
                <td>{inv.clients?.phone || '—'}</td>
                <td>{inv.status === 'partially_paid' ? 'partially paid' : 'unpaid'}</td>
                <td>
                  AED {money(balanceDue(inv))}
                  {inv.status === 'partially_paid' && (
                    <span className="visit-meta"> (of {money(inv.total)})</span>
                  )}
                </td>
                <td>{daysSince(inv.created_at)}</td>
                <td className="unpaid-remind-actions">
                  <button type="button" onClick={() => remindViaWhatsApp(inv)} disabled={!inv.clients?.phone}>
                    💬 WhatsApp
                  </button>
                  <button type="button" onClick={() => remindViaEmail(inv)} disabled={!inv.clients?.email}>
                    ✉️ Email
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
