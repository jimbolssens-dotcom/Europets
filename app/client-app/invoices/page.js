// app/client-app/invoices/page.js
// The logged-in client's own invoices — status, total, and a link to the
// same tax-invoice PDF the "Send to Client" WhatsApp button already
// generates (that route is already public in middleware.js's
// PUBLIC_PATTERNS, so this opens with no extra wiring).

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClientAppSession } from '@/app/_components/useClientAppSession';
import { money, balanceDue, invoiceLabel } from '@/lib/paymentReminders';

const STATUS_LABEL = {
  unpaid: 'Unpaid',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  void: 'Void',
};

export default function ClientAppInvoicesPage() {
  const { clientId, ready } = useClientAppSession();
  const router = useRouter();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ready && !clientId) router.replace('/client-app');
  }, [ready, clientId, router]);

  useEffect(() => {
    if (!ready || !clientId) return;
    let cancelled = false;
    fetch(`/api/invoices?client_id=${clientId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) {
          setInvoices(Array.isArray(data) ? data.filter((inv) => inv.status !== 'void') : []);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ready, clientId]);

  if (!ready) return null;

  return (
    <div className="mobile-page">
      <h1>Invoices</h1>
      {loading ? (
        <p className="mobile-subtitle">Loading...</p>
      ) : invoices.length === 0 ? (
        <p className="mobile-subtitle">No invoices yet.</p>
      ) : (
        <ul className="mobile-list">
          {invoices.map((inv) => {
            const due = balanceDue(inv);
            return (
              <li key={inv.id}>
                <a
                  href={`/api/invoices/${inv.id}/tax-invoice-pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mobile-list-item"
                >
                  <span className="mobile-list-title">
                    {invoiceLabel(inv)}
                    <span className={`client-app-status-pill client-app-status-${inv.status}`}>
                      {STATUS_LABEL[inv.status] || inv.status}
                    </span>
                  </span>
                  <span className="mobile-list-meta">
                    {new Date(inv.created_at).toLocaleDateString()} · AED {money(inv.total)}
                    {due > 0 ? ` · AED ${money(due)} due` : ''}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
