// app/_components/InvoiceReminderLog.jsx
// The automatic payment reminders sent (or tried) for one invoice, from
// GET /api/invoices/:id/reminders: which stage, by WhatsApp or email, when,
// and the error if a send failed. Shown on the invoice page.

'use client';

import { useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/formatTimestamp';

const STAGE_LABELS = { 1: 'Gentle (2 weeks)', 2: 'Second (1 month)', 3: 'Final (2 months)' };

export default function InvoiceReminderLog({ invoiceId, paid }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    fetch(`/api/invoices/${invoiceId}/reminders`)
      .then((res) => res.json())
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]));
  }, [invoiceId]);

  if (rows === null) return null;
  if (rows.length === 0) {
    return (
      <p className="visit-meta">
        {paid
          ? 'No payment reminders were sent for this invoice.'
          : 'No reminders sent yet. If it stays open, the client is reminded automatically by WhatsApp and email at 2 weeks, 1 month and 2 months.'}
      </p>
    );
  }
  return (
    <table className="invoice-reminder-log">
      <thead>
        <tr><th>When</th><th>Reminder</th><th>By</th><th>Due then</th><th>Result</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{formatDateTime(r.sent_at)}</td>
            <td>{STAGE_LABELS[r.stage] || r.stage}</td>
            <td>{r.channel === 'whatsapp' ? '💬 WhatsApp' : '✉️ Email'}</td>
            <td>{r.amount_due != null ? `AED ${Number(r.amount_due).toFixed(2)}` : ''}</td>
            <td>{r.status === 'sent' ? '✅ Sent' : <span className="error">Failed: {r.error}</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
