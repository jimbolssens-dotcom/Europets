// app/accounting/unpaid/page.jsx
// Unpaid invoices, oldest first, with enough client contact info to chase
// a reminder in one click — WhatsApp still opens a whatsapp:// deep link
// (nothing sent server-side), but Email now sends for real via
// lib/paymentReminders.js#sendReminderEmail (the clinic's own SMTP
// mailbox, see lib/email.js).

'use client';

import { useEffect, useState } from 'react';
import { money, balanceDue, invoiceLabel, openWhatsAppReminder, sendReminderEmail } from '@/lib/paymentReminders';

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function UnpaidInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [emailingId, setEmailingId] = useState(null);
  const [sentId, setSentId] = useState(null);
  const [emailError, setEmailError] = useState(null);

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

  async function remindViaEmail(inv) {
    setEmailError(null);
    setSentId(null);
    setEmailingId(inv.id);
    const result = await sendReminderEmail(inv.client_id, inv.clients?.email, inv.clients?.full_name, [inv]);
    setEmailingId(null);
    if (result.ok) {
      setSentId(inv.id);
    } else {
      setEmailError(result.error);
    }
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
      {emailError && <p className="error">{emailError}</p>}
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
                  <button type="button" onClick={() => remindViaEmail(inv)} disabled={!inv.clients?.email || emailingId === inv.id}>
                    {emailingId === inv.id ? 'Sending...' : sentId === inv.id ? '✅ Sent' : '✉️ Email'}
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
