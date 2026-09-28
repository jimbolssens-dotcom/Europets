// app/clients/[id]/page.jsx
// Client detail: contact info plus every patient (pet) this client owns,
// each linking through to that patient's own detail page.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import ClientPhonesEditor, { initialPhoneRow, toEditableRow } from '@/app/_components/ClientPhonesEditor';
import InfoHint from '@/app/_components/InfoHint';
import { EMIRATES } from '@/lib/emirates';
import { money, balanceDue, invoiceLabel, totalBalanceDue, openWhatsAppReminder, openEmailReminder } from '@/lib/paymentReminders';
import PatientHistoryPanel from '@/app/_components/PatientHistoryPanel';
import { openWhatsApp } from '@/lib/whatsapp';
import { formatShortDate } from '@/lib/formatTimestamp';
import { LEGACY_PAYMENT_METHOD_LABELS } from '@/lib/legacyPayments';

export default function ClientDetailPage() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [patients, setPatients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingLink, setSendingLink] = useState(false);
  const [bookingLinkError, setBookingLinkError] = useState(null);
  const [paymentLinkError, setPaymentLinkError] = useState(null);
  const [clientAppLinkError, setClientAppLinkError] = useState(null);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);

  const [legacyPaymentAmount, setLegacyPaymentAmount] = useState('');
  const [legacyPaymentMethod, setLegacyPaymentMethod] = useState('');
  // Defaults to today, but editable — for backfilling a payment that was
  // actually received earlier (e.g. before this table existed at all, see
  // migration 149), so its date reflects reality instead of "whenever
  // someone got around to typing it into this form."
  const [legacyPaymentDate, setLegacyPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recordingLegacyPayment, setRecordingLegacyPayment] = useState(false);
  const [legacyPaymentError, setLegacyPaymentError] = useState(null);

  const [correctingLegacyBalance, setCorrectingLegacyBalance] = useState(false);
  const [legacyBalanceCorrection, setLegacyBalanceCorrection] = useState('');
  const [savingLegacyCorrection, setSavingLegacyCorrection] = useState(false);
  const [legacyCorrectionError, setLegacyCorrectionError] = useState(null);

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
      openWhatsApp(client.phone, message);
    } else {
      await navigator.clipboard.writeText(url);
      setBookingLinkError('No phone number on file — link copied to clipboard instead.');
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
      openWhatsApp(client.phone, message);
    } else {
      navigator.clipboard.writeText(url);
      setPaymentLinkError('No phone number on file — link copied to clipboard instead.');
    }
  }

  // Sent from staff's own WhatsApp, not the clinic's Meta Business API
  // number — this is a one-off, staff-triggered send (never automated), so
  // there's no real upside to routing it through a template that Meta
  // categorizes as Marketing (per-recipient throttling, higher cost, and a
  // quality-rating risk to the whole number) for something this low-volume.
  function sendClientAppLink() {
    setClientAppLinkError(null);
    const url = `${window.location.origin}/client-app`;
    const digits = (client.phone || '').replace(/\D/g, '');
    const message = `Hi ${client.full_name}! You can now view your pet(s), invoices, and appointments anytime here: ${url}`;
    if (digits.length > 3) {
      openWhatsApp(client.phone, message);
    } else {
      navigator.clipboard.writeText(url);
      setClientAppLinkError('No phone number on file — link copied to clipboard instead.');
    }
  }

  // Cache-busting param, on top of the route's own no-store headers, so a
  // browser/download manager can never reuse a previous download of this
  // same statement after another payment or invoice has landed.
  function downloadStatement() {
    window.open(`/api/clients/${id}/statement-pdf?t=${Date.now()}`, '_blank');
  }

  // No cache-busting here — a client-facing link, same reasoning as the
  // invoice page's own sendInvoiceViaWhatsApp/sendInvoiceViaEmail: the
  // route's no-store headers already guarantee a fresh statement every
  // time they open it themselves.
  function sendStatementViaWhatsApp() {
    setPaymentLinkError(null);
    const url = `${window.location.origin}/api/clients/${id}/statement-pdf`;
    const message = `Hi ${client.full_name}! Here is your statement of account from Europets Clinic: ${url}`;
    const digits = (client.phone || '').replace(/\D/g, '');
    if (digits.length > 3) {
      openWhatsApp(client.phone, message);
    } else {
      navigator.clipboard.writeText(url);
      setPaymentLinkError('No phone number on file — link copied to clipboard instead.');
    }
  }

  function sendStatementViaEmail() {
    setPaymentLinkError(null);
    if (!client.email) {
      setPaymentLinkError('No email address on file for this client.');
      return;
    }
    const url = `${window.location.origin}/api/clients/${id}/statement-pdf`;
    const subject = `Europets Clinic — Statement of Account`;
    const body = `Hi ${client.full_name},\n\nHere is your statement of account from Europets Clinic: ${url}\n\nPlease don't hesitate to reach out if you have any questions.`;
    window.open(`mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
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

  // Logs a real legacy_payments row (migration 149) and knocks the same
  // amount off the carried-over old-system balance, clamped at zero — for
  // the common case of a client paying down what they owed the old
  // software over time, without having to open the full Edit form and
  // retype the whole remaining figure by hand. See
  // app/(admin)/accounting/legacy-payments for the accounting-wide view
  // onto every payment logged this way.
  async function recordLegacyPayment(e) {
    e.preventDefault();
    const amount = Number(legacyPaymentAmount);
    if (!amount || amount <= 0) {
      setLegacyPaymentError('Enter an amount paid');
      return;
    }
    if (!legacyPaymentMethod) {
      setLegacyPaymentError('Pick where the money came from');
      return;
    }
    setRecordingLegacyPayment(true);
    setLegacyPaymentError(null);
    const res = await fetch(`/api/clients/${id}/legacy-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, payment_method: legacyPaymentMethod, paid_at: legacyPaymentDate }),
    });
    const data = await res.json().catch(() => ({}));
    setRecordingLegacyPayment(false);
    if (!res.ok) {
      setLegacyPaymentError(data.error || 'Failed to record payment');
      return;
    }
    setLegacyPaymentAmount('');
    setLegacyPaymentMethod('');
    setLegacyPaymentDate(new Date().toISOString().slice(0, 10));
    load();
  }

  function startLegacyBalanceCorrection() {
    setLegacyBalanceCorrection(String(client.legacy_outstanding_balance ?? ''));
    setLegacyCorrectionError(null);
    setCorrectingLegacyBalance(true);
  }

  // A straight PATCH of the number itself — deliberately not the
  // legacy-payments endpoint above: this is for fixing a discrepancy in
  // the carried-over figure itself (an import error, a payment already
  // accounted for elsewhere), not money actually received today, so it
  // creates no legacy_payments row and has no effect on the P&L the way
  // recordLegacyPayment does.
  async function saveLegacyBalanceCorrection(e) {
    e.preventDefault();
    const amount = Number(legacyBalanceCorrection);
    // A negative figure is valid here — a client in credit (overpaid, or
    // the clinic owes them) — so only NaN is actually rejected.
    if (legacyBalanceCorrection === '' || Number.isNaN(amount)) {
      setLegacyCorrectionError('Enter a valid amount');
      return;
    }
    setSavingLegacyCorrection(true);
    setLegacyCorrectionError(null);
    const res = await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legacy_outstanding_balance: amount }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingLegacyCorrection(false);
    if (!res.ok) {
      setLegacyCorrectionError(data.error || 'Failed to update the balance');
      return;
    }
    setCorrectingLegacyBalance(false);
    load();
  }

  if (loading) return <p>Loading client...</p>;
  if (!client || client.error) return <p>Client not found.</p>;

  const outstandingInvoices = invoices
    .filter((inv) => inv.status === 'unpaid' || inv.status === 'partially_paid')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const totalOutstanding = totalBalanceDue(outstandingInvoices);

  // A client with several pets can have outstanding invoices for more than
  // one of them — this list has no other way to tell those apart. Not
  // every invoice is tied to a patient (a standalone product sale isn't).
  function patientFor(inv) {
    return inv.visits?.patients || inv.hospitalizations?.patients;
  }

  return (
    <div>
      <p>
        <a href="/search">&larr; Back to Search</a>
      </p>
      <h1>
        {client.full_name} <span>(Client #{client.client_number})</span>
      </h1>
      <p>
        <a href={`/appointments?client_id=${client.id}`} className="button-link">
          Book Appointment
        </a>{' '}
        <a href={`/consults?client_id=${client.id}`} className="button-link">
          New Consult
        </a>{' '}
        <a href={`/invoices?client_id=${client.id}`} className="button-link">
          Invoice
        </a>{' '}
        {/* The real conversation thread (client_messages, same inbox as
            /messages, over the clinic's own WhatsApp number and the
            client app) — distinct from the openWhatsApp "draft a canned
            message from my own personal phone" buttons further down this
            page, hence the spelled-out label rather than reusing their
            "💬 WhatsApp" wording for something that behaves differently. */}
        <a href={`/messages/${client.id}`} className="button-link" title="Open this client's message thread — the clinic's own WhatsApp number and app chat, unified">
          💬 App/WhatsApp Chat
        </a>{' '}
        <button type="button" className="button-link" onClick={sendBookingLink} disabled={sendingLink}>
          {sendingLink ? 'Sending...' : '📅 Invite'}
        </button>{' '}
        <button type="button" className="button-link" onClick={sendClientAppLink}>
          📱 Client App
        </button>
      </p>
      {bookingLinkError && <p className="error">{bookingLinkError}</p>}
      {clientAppLinkError && <p className="error">{clientAppLinkError}</p>}

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
        <details className="legacy-balance-note">
          <summary>
            ⚠️ Old system balance: AED {money(client.legacy_outstanding_balance)}{' '}
            <InfoHint>
              Carried over from the previous clinic software at import — not reflected in any
              invoice here. Record what they pay off below as it comes in, or correct the figure
              itself if it doesn't match what's actually owed.
            </InfoHint>
          </summary>
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
            <label>
              Origin
              <select value={legacyPaymentMethod} onChange={(e) => setLegacyPaymentMethod(e.target.value)}>
                <option value="">Select...</option>
                {Object.entries(LEGACY_PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date paid
              <input
                type="date"
                value={legacyPaymentDate}
                onChange={(e) => setLegacyPaymentDate(e.target.value)}
              />
            </label>
            <button type="submit" disabled={recordingLegacyPayment}>
              {recordingLegacyPayment ? 'Saving...' : 'Record Payment'}
            </button>
          </form>

          {/* A straight correction to the carried-over figure itself —
              distinct from Record Payment above (which logs real money
              received and feeds the P&L). This just fixes a wrong number,
              e.g. an import discrepancy — no legacy_payments row, no
              accounting effect. */}
          {correctingLegacyBalance ? (
            <form className="legacy-balance-payment-form" onSubmit={saveLegacyBalanceCorrection}>
              {legacyCorrectionError && <p className="error">{legacyCorrectionError}</p>}
              <label>
                Correct balance to (AED)
                <input
                  type="number"
                  step="0.01"
                  autoFocus
                  value={legacyBalanceCorrection}
                  onChange={(e) => setLegacyBalanceCorrection(e.target.value)}
                />
              </label>
              <button type="submit" disabled={savingLegacyCorrection}>
                {savingLegacyCorrection ? 'Saving...' : 'Save Correction'}
              </button>
              <button type="button" onClick={() => setCorrectingLegacyBalance(false)} disabled={savingLegacyCorrection}>
                Cancel
              </button>
            </form>
          ) : (
            <button type="button" className="legacy-balance-correct-link" onClick={startLegacyBalanceCorrection}>
              ✏️ Correct this number
            </button>
          )}
        </details>
      )}

      <div className="card financial-overview">
        <div className="financial-overview-total">
          <span className="financial-overview-total-label">Total Outstanding</span>
          <span className={`financial-overview-total-amount${totalOutstanding > 0 ? ' financial-overview-total-amount-due' : ''}`}>
            AED {money(totalOutstanding)}
          </span>
        </div>

        <p className="financial-overview-group-label">
          Send full statement <InfoHint>Every invoice and payment on file, with dates and running balance — a document, not just a reminder.</InfoHint>
        </p>
        <div className="financial-overview-actions">
          <button type="button" onClick={downloadStatement}>
            📄 Download
          </button>
          <button type="button" onClick={sendStatementViaWhatsApp} disabled={!client.phone}>
            💬 WhatsApp
          </button>
          <button type="button" onClick={sendStatementViaEmail} disabled={!client.email}>
            ✉️ Email
          </button>
        </div>

        {totalOutstanding > 0 && (
          <>
            <p className="financial-overview-group-label">
              Remind to pay <InfoHint>A short message naming what's still owed, with a link to pay online — no attachment.</InfoHint>
            </p>
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
          </>
        )}
        {paymentLinkError && <p className="error">{paymentLinkError}</p>}

        {outstandingInvoices.length > 0 ? (
          <table className="financial-overview-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Patient</th>
                <th>Status</th>
                <th>Balance Due</th>
              </tr>
            </thead>
            <tbody>
              {outstandingInvoices.map((inv) => {
                const patient = patientFor(inv);
                return (
                  <tr key={inv.id}>
                    <td>
                      <a href={`/invoices/${inv.id}`}>{invoiceLabel(inv)}</a>
                    </td>
                    <td>{formatShortDate(inv.created_at)}</td>
                    <td>
                      {patient ? `${patient.name}${patient.patient_number ? ` (#${patient.patient_number})` : ''}` : '—'}
                    </td>
                    <td>{inv.status === 'partially_paid' ? 'partially paid' : 'unpaid'}</td>
                    <td>AED {money(balanceDue(inv))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="visit-meta">No outstanding invoices.</p>
        )}
      </div>

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
                  style={p.deceased || p.rehomed ? { textDecoration: 'line-through' } : undefined}
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
