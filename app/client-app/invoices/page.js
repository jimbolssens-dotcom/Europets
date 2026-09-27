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
import { formatShortDate } from '@/lib/formatTimestamp';

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
    <div className="mobile-page client-app-invoices-page">
      <h1>Invoices</h1>
      {loading ? (
        <p className="mobile-subtitle">Loading...</p>
      ) : invoices.length === 0 ? (
        <p className="mobile-subtitle">No invoices yet.</p>
      ) : (
        <>
          <div className="client-app-table-head client-app-desktop-only-inline">
            <span className="client-app-table-head-primary">Invoice</span>
            <span className="client-app-table-head-date">Date</span>
            <span className="client-app-table-head-secondary">Status</span>
            <span className="client-app-table-head-total">Total</span>
            <span className="client-app-table-head-action" />
          </div>
          <ul className="mobile-list">
            {invoices.map((inv) => {
              const due = balanceDue(inv);
              return (
                <li key={inv.id}>
                  <a
                    href={`/api/invoices/${inv.id}/tax-invoice-pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mobile-list-item client-app-table-row"
                  >
                    <span className="mobile-list-title client-app-mobile-only-inline">
                      {invoiceLabel(inv)}
                      <span className={`client-app-status-pill client-app-status-${inv.status}`}>
                        {STATUS_LABEL[inv.status] || inv.status}
                      </span>
                    </span>
                    <span className="mobile-list-meta client-app-mobile-only-inline">
                      {formatShortDate(inv.created_at)} · AED {money(inv.total)}
                      {due > 0 ? ` · AED ${money(due)} due` : ''}
                    </span>

                    <span className="client-app-table-cell client-app-table-cell-primary client-app-desktop-only-inline">
                      {invoiceLabel(inv)}
                    </span>
                    <span className="client-app-table-cell client-app-table-cell-date client-app-desktop-only-inline">
                      {formatShortDate(inv.created_at)}
                    </span>
                    <span className="client-app-table-cell client-app-table-cell-secondary client-app-desktop-only-inline">
                      <span className={`client-app-status-pill client-app-status-${inv.status}`}>
                        {STATUS_LABEL[inv.status] || inv.status}
                      </span>
                    </span>
                    <span className="client-app-table-cell client-app-table-cell-total client-app-desktop-only-inline">
                      AED {money(inv.total)}
                      {due > 0 ? ` (${money(due)} due)` : ''}
                    </span>
                    <span className="client-app-table-cell client-app-table-cell-action client-app-desktop-only-inline">
                      Tax Invoice ↗
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
