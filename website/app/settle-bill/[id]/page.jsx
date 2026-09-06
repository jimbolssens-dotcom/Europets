'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CONTACT } from '@/lib/content';

function money(n) {
  return Number(n || 0).toFixed(2);
}

export default function SettleBillPage() {
  const { id } = useParams();
  const [state, setState] = useState('loading'); // loading | due | paid | void | not_found | error
  const [invoice, setInvoice] = useState(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);
  // Set from ?paid=1/0 once, right after Nomod redirects back here — this
  // is only ever a hint for which banner to show, never proof of payment
  // (a URL can be typed by hand), so the invoice's real status below still
  // comes from our own database, polled until it catches up.
  const [returnedFromNomod, setReturnedFromNomod] = useState(null); // null | 'success' | 'failure'

  const loadInvoice = () =>
    fetch(`/api/settle-bill/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('not_found');
        return res.json();
      })
      .then((data) => {
        setInvoice(data);
        if (data.status === 'void') setState('void');
        else if (data.status === 'paid' || data.balance_due <= 0) setState('paid');
        else setState('due');
        return data;
      })
      .catch(() => setState('not_found'));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paid = params.get('paid');
    if (paid === '1') setReturnedFromNomod('success');
    else if (paid === '0') setReturnedFromNomod('failure');

    loadInvoice();

    // Nomod doesn't confirm payment back to us automatically yet, so a
    // client landing back here right after paying won't see it reflected
    // immediately — poll for a bit in case staff (or a future automated
    // reconciliation) marks it paid while this tab is still open.
    if (paid === '1') {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts += 1;
        loadInvoice().then((data) => {
          if ((data && (data.status === 'paid' || data.balance_due <= 0)) || attempts >= 12) {
            clearInterval(interval);
          }
        });
      }, 5000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function payNow() {
    setPaying(true);
    setError(null);
    const res = await fetch(`/api/settle-bill/${id}`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPaying(false);
      setError(data.error || 'Something went wrong. Please try again.');
      return;
    }
    window.location.href = data.url;
  }

  if (state === 'loading') {
    return (
      <div className="section">
        <div className="container review-submit-narrow">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (state === 'not_found') {
    return (
      <div className="section">
        <div className="container review-submit-narrow">
          <h1 className="page-title">Link not found</h1>
          <p className="page-lede">
            This payment link doesn&apos;t look right. Please check the link we sent you, or{' '}
            <a href={`https://wa.me/${CONTACT.mobileHref}`}>message us on WhatsApp</a>.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'void') {
    return (
      <div className="section">
        <div className="container review-submit-narrow">
          <h1 className="page-title">This invoice was voided</h1>
          <p className="page-lede">
            There&apos;s nothing to pay here. If you think that&apos;s wrong, please{' '}
            <a href={`https://wa.me/${CONTACT.mobileHref}`}>get in touch</a>.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'paid') {
    return (
      <div className="section">
        <div className="container review-submit-narrow">
          <h1 className="page-title">All settled</h1>
          <p className="page-lede">This invoice is already fully paid. Thank you!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="container review-submit-narrow">
        <span className="eyebrow">Invoice #{invoice.invoice_number}</span>
        <h1 className="page-title">
          {invoice.client_first_name ? `Hi ${invoice.client_first_name}, settle your bill` : 'Settle your bill'}
        </h1>
        <p className="page-lede">Pay securely online with Nomod. No need to come in with cash or a card.</p>

        {returnedFromNomod === 'success' && (
          <p className="settle-bill-notice">
            Thanks! We&apos;re confirming your payment now. This can take a few minutes to show here.
            If the balance below doesn&apos;t update shortly, don&apos;t worry, we&apos;ll have it recorded on our end.
          </p>
        )}
        {returnedFromNomod === 'failure' && (
          <p className="settle-bill-notice settle-bill-notice-error">
            That payment didn&apos;t go through. No charge was made. Feel free to try again below.
          </p>
        )}

        <div className="card settle-bill-card">
          <p className="settle-bill-amount">
            AED {money(invoice.balance_due)}
            <span>balance due</span>
          </p>

          {error && <p className="form-error">{error}</p>}

          <button type="button" className="btn btn-primary" onClick={payNow} disabled={paying}>
            {paying ? 'Redirecting to Nomod...' : 'Pay Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
