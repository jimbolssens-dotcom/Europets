// app/clients/[id]/page.jsx
// Client detail: contact info plus every patient (pet) this client owns,
// each linking through to that patient's own detail page.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import ScanIdButton from '@/app/_components/ScanIdButton';
import ClientPhonesEditor, { initialPhoneRow, toEditableRow } from '@/app/_components/ClientPhonesEditor';
import InfoHint from '@/app/_components/InfoHint';
import { uploadAttachment } from '@/lib/attachments';
import { EMIRATES } from '@/lib/emirates';
import { money, balanceDue, invoiceLabel, totalBalanceDue, openWhatsAppReminder, openEmailReminder } from '@/lib/paymentReminders';
import PatientHistoryPanel from '@/app/_components/PatientHistoryPanel';

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
  const [paymentLinkError, setPaymentLinkError] = useState(null);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);

  const [legacyPaymentAmount, setLegacyPaymentAmount] = useState('');
  const [recordingLegacyPayment, setRecordingLegacyPayment] = useState(false);
  const [legacyPaymentError, setLegacyPaymentError] = useState(null);

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

  // Points the client at a "Settle Your Bill" page scoped to their whole
  // account (website/app/settle-bill/owner/[clientId]) rather than one
  // invoice — for a campaign link that pays off whatever they currently
  // owe across all their outstanding invoices, oldest-first (see
  // website/lib/nomodPayments#recordNomodOwnerPayment). Same pattern as
  // the per-invoice "Send" button on the invoice page: no link is
  // generated here, the website builds the actual Nomod link lazily for
  // whatever the balance happens to be when the client opens it.
  function sendPaymentLink() {
    setPaymentLinkError(null);
    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://epc.vet';
    const url = `${websiteUrl}/settle-bill/owner/${id}`;
    const digits = (client.phone || '').replace(/\D/g, '');
    const message = `Hi ${client.full_name}! You can settle your outstanding balance with Europets Clinic online here: ${url}`;
    if (digits.length > 3) {
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank');
    } else {
      navigator.clipboard.writeText(url);
      setPaymentLinkError('No phone number on file — link copied to clipboard instead.');
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

  function startEdit() {
    const phones = (client.client_phones || []).map(toEditableRow);
    setEditForm({
      full_name: client.full_name || '',
      phones: phones.length > 0 ? phones : [initialPhoneRow(client.phone)],
      emirates_id: client.emirates_id || '',
      trn: client.trn || '',
      email: client.email || '',
      address: client.address || '',
      emirate: client.emirate || '',
      legacy_outstanding_balance: client.legacy_outstanding_balance ?? '',
    });
    setEditError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditError(null);
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSavingEdit(true);
    setEditError(null);
    const res = await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    const data = await res.json();
    setSavingEdit(false);
    if (!res.ok) {
      setEditError(data.error || 'Failed to save client');
      return;
    }
    setEditing(false);
    load();
  }

  // Knocks a payment off the carried-over old-system balance, clamped at
  // zero — for the common case of a client paying down what they owed the
  // old software over time, without having to open the full Edit form and
  // retype the whole remaining figure by hand.
  async function recordLegacyPayment(e) {
    e.preventDefault();
    const amount = Number(legacyPaymentAmount);
    if (!amount || amount <= 0) {
      setLegacyPaymentError('Enter an amount paid');
      return;
    }
    setRecordingLegacyPayment(true);
    setLegacyPaymentError(null);
    const newBalance = Math.max(0, Math.round((client.legacy_outstanding_balance - amount) * 100) / 100);
    const res = await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legacy_outstanding_balance: newBalance }),
    });
    const data = await res.json().catch(() => ({}));
    setRecordingLegacyPayment(false);
    if (!res.ok) {
      setLegacyPaymentError(data.error || 'Failed to record payment');
      return;
    }
    setLegacyPaymentAmount('');
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
        <a href="/search">&larr; Back to Search</a>
      </p>
      <h1>
        {client.full_name} <span>(Client #{client.client_number})</span>
      </h1>

      {editing ? (
        <form className="card" onSubmit={saveEdit}>
          {editError && <p className="error">{editError}</p>}
          <label>
            Full name
            <input
              value={editForm.full_name}
              onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
              required
            />
          </label>
          <ClientPhonesEditor
            phones={editForm.phones}
            onChange={(phones) => setEditForm({ ...editForm, phones })}
            groupName="client-edit"
          />
          <label>
            Emirates ID
            <input
              value={editForm.emirates_id}
              onChange={(e) => setEditForm({ ...editForm, emirates_id: e.target.value })}
            />
          </label>
          <label>
            TRN (only if a VAT-registered business)
            <input value={editForm.trn} onChange={(e) => setEditForm({ ...editForm, trn: e.target.value })} />
          </label>
          <label>
            Email
            <input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
          </label>
          <label>
            Address
            <input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
          </label>
          <label>
            Emirate
            <select value={editForm.emirate} onChange={(e) => setEditForm({ ...editForm, emirate: e.target.value })}>
              <option value="">Select...</option>
              {EMIRATES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label>
            Old system balance (AED){' '}
            <InfoHint>
              Carried over from the previous clinic software at import — not linked to any
              invoice here. Clear it once you&apos;ve reconciled it against the old records.
            </InfoHint>
            <input
              type="number"
              step="0.01"
              value={editForm.legacy_outstanding_balance}
              onChange={(e) => setEditForm({ ...editForm, legacy_outstanding_balance: e.target.value })}
            />
          </label>
          <div className="home-links">
            <button type="submit" disabled={savingEdit}>
              {savingEdit ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={cancelEdit} disabled={savingEdit}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p>
          {(client.client_phones || []).length > 0
            ? client.client_phones
                .map((p) => `${p.phone} (${p.label}${p.is_whatsapp ? ' · WhatsApp' : ''})`)
                .join(' · ')
            : client.phone}{' '}
          · {client.email}
          {client.address ? ` · ${client.address}` : ''}
          {client.emirate ? ` · ${client.emirate}` : ''}
          {client.emirates_id ? ` · Emirates ID: ${client.emirates_id}` : ''}
          {client.trn ? ` · TRN: ${client.trn}` : ''}{' '}
          <button type="button" onClick={startEdit}>
            Edit
          </button>
        </p>
      )}

      {client.legacy_outstanding_balance > 0 && (
        <div className="legacy-balance-note">
          <p>
            ⚠️ Old system balance: AED {money(client.legacy_outstanding_balance)}{' '}
            <InfoHint>
              Carried over from the previous clinic software at import — not reflected in any
              invoice here. Record what they pay off below as it comes in, or clear it from
              Edit once fully reconciled.
            </InfoHint>
          </p>
          <form className="legacy-balance-payment-form" onSubmit={recordLegacyPayment}>
            {legacyPaymentError && <p className="error">{legacyPaymentError}</p>}
            <label>
              Record payment (AED)
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Amount paid"
                value={legacyPaymentAmount}
                onChange={(e) => setLegacyPaymentAmount(e.target.value)}
              />
            </label>
            <button type="submit" disabled={recordingLegacyPayment}>
              {recordingLegacyPayment ? 'Saving...' : 'Record Payment'}
            </button>
          </form>
        </div>
      )}

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
              💬 WhatsApp
            </button>
            <button
              type="button"
              onClick={() => openEmailReminder(client.email, client.full_name, outstandingInvoices)}
              disabled={!client.email}
            >
              ✉️ Email
            </button>
            <button type="button" onClick={sendPaymentLink}>
              💳 Pay All
            </button>
          </div>
        )}
        {paymentLinkError && <p className="error">{paymentLinkError}</p>}

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
          {sendingLink ? 'Sending...' : '📅 Invite'}
        </button>{' '}
        <button type="button" onClick={sendReviewLink} disabled={sendingReviewLink}>
          {sendingReviewLink ? 'Sending...' : '⭐ Review'}
        </button>
      </p>
      {bookingLinkError && <p className="error">{bookingLinkError}</p>}
      {reviewLinkError && <p className="error">{reviewLinkError}</p>}

      <h2>Emirates ID</h2>
      {!client.emirates_id && <ScanIdButton onScanned={handleScanned} />}

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
        <a href={`/add?client_id=${client.id}`}>Add a patient for this client &rarr;</a>
      </p>

      <PatientHistoryPanel clientId={client.id} showHospitalizations={false} title="Consult & Invoice History" />
    </div>
  );
}
