// app/clients/[id]/page.jsx
// Client detail: contact info plus every patient (pet) this client owns,
// each linking through to that patient's own detail page.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AttachmentSection from '@/app/_components/AttachmentSection';
import ScanIdButton from '@/app/_components/ScanIdButton';
import { uploadAttachment } from '@/lib/attachments';
import { money, balanceDue, invoiceLabel, totalBalanceDue, openWhatsAppReminder, openEmailReminder } from '@/lib/paymentReminders';

export default function ClientDetailPage() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [patients, setPatients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingLink, setSendingLink] = useState(false);
  const [bookingLinkError, setBookingLinkError] = useState(null);
  const [sendingReviewLink, setSendingReviewLink] = useState(false);
  const [reviewLinkError, setReviewLinkError] = useState(null);

  const load = () =>
    Promise.all([
      fetch(`/api/clients/${id}`).then((res) => res.json()),
      fetch(`/api/patients?client_id=${id}`).then((res) => res.json()),
      fetch(`/api/invoices?client_id=${id}`).then((res) => res.json()),
    ]).then(([clientData, patientsData, invoicesData]) => {
      setClient(clientData);
      setPatients(Array.isArray(patientsData) ? patientsData : []);
      setInvoices(Array.isArray(invoicesData) ? invoicesData : []);
      setLoading(false);
    });

  useEffect(() => {
    load();

    const channel = supabase
      .channel(`client-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patients', filter: `client_id=eq.${id}` },
        () => load()
      )
      .on(
        // invoices.amount_paid/status are kept in sync from invoice_payments
        // (see lib/invoicing.js), so subscribing here alone also catches a
        // payment being logged, without needing a second subscription on a
        // table that carries no client_id to filter on.
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices', filter: `client_id=eq.${id}` },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Generates a link scoped to this one client (see POST /api/intake-
  // requests) — the public form it opens only ever shows this client's
  // own pets, never anyone else's, and lets them pick one (or add a new
  // one) and request a consult/spay/castration slot, held for staff
  // approval like a new-client intake submission.
  async function sendBookingLink() {
    setBookingLinkError(null);
    setSendingLink(true);
    const res = await fetch('/api/intake-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: id, sent_to_phone: client.phone || null }),
    });
    const data = await res.json().catch(() => null);
    setSendingLink(false);
    if (!res.ok) {
      setBookingLinkError(data?.error || 'Failed to generate a booking link');
      return;
    }
    const url = `${window.location.origin}/portal/intake/${data.id}`;
    const digits = (client.phone || '').replace(/\D/g, '');
    const message = `Hi ${client.full_name}! Please pick or add your pet and request an appointment here: ${url}`;
    if (digits.length > 3) {
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank');
    } else {
      await navigator.clipboard.writeText(url);
      setBookingLinkError('No phone number on file — link copied to clipboard instead.');
    }
  }

  // Generates a link to the public website's review form, scoped to this
  // one client, and drafts it in WhatsApp — same pattern as sendBookingLink
  // above, but landing on the website (see website/app/reviews/submit/[id])
  // instead of the app's own portal, since reviews are public-facing.
  async function sendReviewLink() {
    setReviewLinkError(null);
    setSendingReviewLink(true);
    const res = await fetch('/api/review-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: id, sent_to_phone: client.phone || null }),
    });
    const data = await res.json().catch(() => null);
    setSendingReviewLink(false);
    if (!res.ok) {
      setReviewLinkError(data?.error || 'Failed to generate a review link');
      return;
    }
    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://epc.vet';
    const url = `${websiteUrl}/reviews/submit/${data.id}`;
    const digits = (client.phone || '').replace(/\D/g, '');
    const message = `Hi ${client.full_name}! Thanks for visiting Europets Clinic — we'd love to hear how it went. Could you leave us a quick review here? ${url}`;
    if (digits.length > 3) {
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank');
    } else {
      await navigator.clipboard.writeText(url);
      setReviewLinkError('No phone number on file — link copied to clipboard instead.');
    }
  }

  async function handleScanned({ full_name, emirates_id, file }) {
    const update = {};
    if (full_name && !client.full_name) update.full_name = full_name;
    if (emirates_id) update.emirates_id = emirates_id;
    if (Object.keys(update).length > 0) {
      await fetch(`/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
    }
    if (file) {
      await uploadAttachment({ entityType: 'client', entityId: id, file }).catch(() => {});
    }
    load();
  }

  if (loading) return <p>Loading client...</p>;
  if (!client || client.error) return <p>Client not found.</p>;

  const outstandingInvoices = invoices
    .filter((inv) => inv.status === 'unpaid' || inv.status === 'partially_paid')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const totalOutstanding = totalBalanceDue(outstandingInvoices);

  return (
    <div>
      <p>
        <a href="/clients">&larr; All clients</a>
      </p>
      <h1>
        {client.full_name} <span>(Client #{client.client_number})</span>
      </h1>
      <p>
        {(client.client_phones || []).length > 0
          ? client.client_phones
              .map((p) => `${p.phone} (${p.label}${p.is_whatsapp ? ' · WhatsApp' : ''})`)
              .join(' · ')
          : client.phone}{' '}
        · {client.email}
        {client.address ? ` · ${client.address}` : ''}
        {client.emirates_id ? ` · Emirates ID: ${client.emirates_id}` : ''}
        {client.trn ? ` · TRN: ${client.trn}` : ''}
      </p>

      <div className="card financial-overview">
        <div className="financial-overview-total">
          <span className="financial-overview-total-label">Total Outstanding</span>
          <span className={`financial-overview-total-amount${totalOutstanding > 0 ? ' financial-overview-total-amount-due' : ''}`}>
            AED {money(totalOutstanding)}
          </span>
        </div>

        {totalOutstanding > 0 && (
          <div className="financial-overview-actions">
            <button
              type="button"
              onClick={() => openWhatsAppReminder(client.phone, client.full_name, outstandingInvoices)}
              disabled={!client.phone}
            >
              💬 Remind via WhatsApp
            </button>
            <button
              type="button"
              onClick={() => openEmailReminder(client.email, client.full_name, outstandingInvoices)}
              disabled={!client.email}
            >
              ✉️ Remind via Email
            </button>
          </div>
        )}

        {outstandingInvoices.length > 0 ? (
          <table className="financial-overview-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Status</th>
                <th>Balance Due</th>
              </tr>
            </thead>
            <tbody>
              {outstandingInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <a href={`/invoices/${inv.id}`}>{invoiceLabel(inv)}</a>
                  </td>
                  <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                  <td>{inv.status === 'partially_paid' ? 'partially paid' : 'unpaid'}</td>
                  <td>AED {money(balanceDue(inv))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="visit-meta">No outstanding invoices.</p>
        )}
      </div>

      <p>
        <button type="button" onClick={sendBookingLink} disabled={sendingLink}>
          {sendingLink ? 'Sending...' : '📅 Send Invite'}
        </button>{' '}
        <button type="button" onClick={sendReviewLink} disabled={sendingReviewLink}>
          {sendingReviewLink ? 'Sending...' : '⭐ Request a Review'}
        </button>
      </p>
      {bookingLinkError && <p className="error">{bookingLinkError}</p>}
      {reviewLinkError && <p className="error">{reviewLinkError}</p>}

      <h2>Emirates ID</h2>
      <ScanIdButton
        label={client.emirates_id ? '📷 Re-scan Emirates ID' : '📷 Scan Emirates ID'}
        onScanned={handleScanned}
      />
      <AttachmentSection entityType="client" entityId={id} />

      <h2>Patients</h2>
      <table>
        <thead>
          <tr>
            <th>Patient #</th>
            <th>Name</th>
            <th>Species</th>
            <th>Breed</th>
            <th>Weight (kg)</th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <tr key={p.id}>
              <td>{p.patient_number}</td>
              <td>
                <a
                  href={`/patients/${p.id}`}
                  style={p.deceased ? { textDecoration: 'line-through' } : undefined}
                >
                  {p.name}
                </a>
              </td>
              <td>{p.species}</td>
              <td>{p.breed}</td>
              <td>{p.current_weight_kg}</td>
            </tr>
          ))}
          {patients.length === 0 && (
            <tr>
              <td colSpan={5}>No patients for this client yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      <p>
        <a href="/patients">Add a patient for this client &rarr;</a>
      </p>
    </div>
  );
}
