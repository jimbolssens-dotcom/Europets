// app/clients/[id]/page.jsx
// Client detail: contact info plus every patient (pet) this client owns,
// each linking through to that patient's own detail page.

'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import ClientPhonesEditor, { initialPhoneRow, toEditableRow } from '@/app/_components/ClientPhonesEditor';
import InfoHint from '@/app/_components/InfoHint';
import { EMIRATES } from '@/lib/emirates';
import { money, balanceDue, invoiceLabel, totalBalanceDue } from '@/lib/paymentReminders';
import PatientHistoryPanel from '@/app/_components/PatientHistoryPanel';
import { sendPaymentMessage } from '@/lib/sendPaymentMessageClient';
import { openWhatsApp } from '@/lib/whatsapp';
import { formatShortDate } from '@/lib/formatTimestamp';
import { appOrigin } from '@/lib/appOrigin';
import { DEFAULT_LEGACY_PAYMENT_METHODS } from '@/lib/legacyPayments';
import { nextReminderDate, stageShort } from '@/lib/reminderStages';
import { readViewCacheEntry, writeViewCacheEntry } from '@/lib/viewCache';
import { fetchJsonPrefetched } from '@/lib/prefetchData';
import ActionMenu from '@/app/_components/ActionMenu';
import CrossRecordLinks from '@/app/_components/CrossRecordLinks';

export default function ClientDetailPage() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [patients, setPatients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingLink, setSendingLink] = useState(false);
  const [bookingLinkError, setBookingLinkError] = useState(null);
  const [paymentLinkError, setPaymentLinkError] = useState(null);
  const [statementEmailSending, setStatementEmailSending] = useState(false);
  const [statementEmailSent, setStatementEmailSent] = useState(false);
  const [clientAppLinkError, setClientAppLinkError] = useState(null);
  // Outstanding card: automatic reminders already sent to this client
  // (newest first), which button is sending, and the folded invoice list.
  const [reminderLog, setReminderLog] = useState([]);
  const [outstandingSending, setOutstandingSending] = useState(null); // 'whatsapp' | 'email' | null
  const [showAllOutstanding, setShowAllOutstanding] = useState(false);
  // The client's personal payment link (migration 213, lib/clientPayLinks.js):
  // anyone can pay any amount towards their account; it's applied to their
  // invoices automatically and the rest kept as credit.
  const [payLink, setPayLink] = useState(null); // { link, credit }
  const [payLinkOpen, setPayLinkOpen] = useState(false);
  const [payLinkBusy, setPayLinkBusy] = useState(false);
  const [payLinkNote, setPayLinkNote] = useState(null);
  useEffect(() => {
    fetch(`/api/clients/${id}/payment-reminders`)
      .then((res) => res.json())
      .then((data) => setReminderLog(Array.isArray(data) ? data : []))
      .catch(() => setReminderLog([]));
  }, [id]);

  function payAllUrl() {
    return `${process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://epc.vet'}/settle-bill/owner/${id}`;
  }

  // One message for "please pay": the balance and the pay-everything link
  // (whose page also offers the statement download), from the clinic's
  // WhatsApp number. Staff WhatsApp only while Meta is still approving it.
  useEffect(() => {
    fetch(`/api/clients/${id}/pay-link`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setPayLink(data))
      .catch(() => {});
  }, [id]);

  async function savePayLink(body) {
    setPayLinkBusy(true);
    setPayLinkNote(null);
    const res = await fetch(`/api/clients/${id}/pay-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setPayLinkBusy(false);
    if (!res.ok) {
      setPayLinkNote(data.error || 'Could not make the link.');
      return null;
    }
    setPayLink(data);
    return data;
  }

  async function openPayLink() {
    setPayLinkOpen((open) => !open);
    if (!payLink?.link) await savePayLink({});
  }

  async function copyPayLink() {
    try {
      await navigator.clipboard.writeText(payLink.link.url);
      setPayLinkNote('✅ Copied');
    } catch {
      setPayLinkNote('Select the link and copy it by hand.');
    }
  }

  function sendPayLink() {
    const pet = payLink.link.patient_name;
    openWhatsApp(
      client.phone,
      `Hi ${client.full_name}! Here is your personal Europets payment link${pet ? ` for ${pet}` : ''}. You, or anyone helping, can pay any amount by card and it goes straight onto your account: ${payLink.link.url}`
    );
  }

  async function newPayLink() {
    if (!confirm('Make a new link? The old one stops working.')) return;
    const data = await savePayLink({ fresh: true });
    if (data) setPayLinkNote('✅ New link made. The old one no longer works.');
  }

  async function sendOutstandingWhatsApp() {
    setPaymentLinkError(null);
    setOutstandingSending('whatsapp');
    const statementUrl = `${appOrigin()}/api/clients/${id}/statement-pdf`;
    const result = await sendPaymentMessage({
      clientId: id,
      kind: 'link',
      phone: client.phone,
      fallbackMessage: `Hi ${client.full_name}, here is your secure link to settle your balance of AED ${money(totalOutstanding)} with Europets Clinic: ${payAllUrl()}\n\nYour full statement: ${statementUrl}\n\nIf you have any questions about the bill, just reply to this message. Thank you!`,
    });
    setOutstandingSending(null);
    setPaymentLinkError(result.note);
  }

  // Same by email: each open invoice with its own amount, the
  // pay-everything link and the statement link.
  async function sendOutstandingEmail() {
    setPaymentLinkError(null);
    setOutstandingSending('email');
    const statementUrl = `${appOrigin()}/api/clients/${id}/statement-pdf`;
    const lines = outstandingInvoices.map((inv) => `${invoiceLabel(inv)}: AED ${money(balanceDue(inv))}`).join('\n');
    const text = `Hi ${client.full_name},\n\nWe hope you and your pet are doing well! Here is an overview of your open balance with Europets Clinic, a total of AED ${money(totalOutstanding)}:\n\n${lines}\n\nYou can settle everything securely online here: ${payAllUrl()}\nYour full statement of account: ${statementUrl}\n\nIf you have any questions about the bill, just reply to this email and we will be happy to help.\n\nWarm regards,\nThe Europets Clinic team`;
    try {
      const res = await fetch(`/api/clients/${id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: 'Your Europets Clinic balance', text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setPaymentLinkError('✅ Sent by email');
    } catch (err) {
      setPaymentLinkError(err.message);
    } finally {
      setOutstandingSending(null);
    }
  }


  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);

  const [legacyPaymentAmount, setLegacyPaymentAmount] = useState('');
  const [legacyPaymentMethod, setLegacyPaymentMethod] = useState('');
  const [legacyPaymentNote, setLegacyPaymentNote] = useState('');
  // The Origin dropdown's options — staff-managed (migration 155), not a
  // fixed set, so anyone can add "Nomod", "Tap", "PayPal", etc. Seeded
  // with the defaults until the real list loads. See
  // app/api/accounting/legacy-payment-methods.
  const [legacyPaymentMethods, setLegacyPaymentMethods] = useState(DEFAULT_LEGACY_PAYMENT_METHODS);
  const [addingLegacyPaymentMethod, setAddingLegacyPaymentMethod] = useState(false);
  const [newLegacyPaymentMethodName, setNewLegacyPaymentMethodName] = useState('');
  const [savingLegacyPaymentMethod, setSavingLegacyPaymentMethod] = useState(false);
  const [legacyPaymentMethodError, setLegacyPaymentMethodError] = useState(null);
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
      // Already on their way if the pointer was just over a link here (lib/prefetchData.js).
      fetchJsonPrefetched(`/api/clients/${id}`),
      fetchJsonPrefetched(`/api/patients?client_id=${id}`),
      fetchJsonPrefetched(`/api/invoices?client_id=${id}`),
    ]).then(([clientData, patientsData, invoicesData]) => {
      setClient(clientData);
      setPatients(Array.isArray(patientsData) ? patientsData : []);
      setInvoices(Array.isArray(invoicesData) ? invoicesData : []);
      setLoading(false);
      if (clientData && !clientData.error && Array.isArray(patientsData) && Array.isArray(invoicesData)) {
        writeViewCacheEntry('europets-client-v1', id, { client: clientData, patients: patientsData, invoices: invoicesData }, 30);
      }
    });

  // This client as they last loaded here, shown at once while the fresh
  // copy loads (lib/viewCache.js; the last 30 clients opened are kept).
  useLayoutEffect(() => {
    const cached = readViewCacheEntry('europets-client-v1', id);
    if (!cached?.client) return;
    setClient(cached.client);
    setPatients(Array.isArray(cached.patients) ? cached.patients : []);
    setInvoices(Array.isArray(cached.invoices) ? cached.invoices : []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    fetch('/api/accounting/legacy-payment-methods')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length) setLegacyPaymentMethods(data);
      });

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
    const url = `${appOrigin()}/portal/intake/${data.id}`;
    const digits = (client.phone || '').replace(/\D/g, '');
    const message = `Hi ${client.full_name}! Please pick or add your pet and request an appointment here: ${url}`;
    if (digits.length > 3) {
      openWhatsApp(client.phone, message);
    } else {
      await navigator.clipboard.writeText(url);
      setBookingLinkError('No phone number on file — link copied to clipboard instead.');
    }
  }

  // Sent from staff's own WhatsApp, not the clinic's Meta Business API
  // number — this is a one-off, staff-triggered send (never automated), so
  // there's no real upside to routing it through a template that Meta
  // categorizes as Marketing (per-recipient throttling, higher cost, and a
  // quality-rating risk to the whole number) for something this low-volume.
  function sendClientAppLink() {
    setClientAppLinkError(null);
    const url = `${appOrigin()}/client-app`;
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

  async function sendStatementViaEmail() {
    setPaymentLinkError(null);
    setStatementEmailSent(false);
    if (!client.email) {
      setPaymentLinkError('No email address on file for this client.');
      return;
    }
    const url = `${appOrigin()}/api/clients/${id}/statement-pdf`;
    const subject = `Europets Clinic — Statement of Account`;
    const text = `Hi ${client.full_name},\n\nHere is your statement of account from Europets Clinic: ${url}\n\nPlease don't hesitate to reach out if you have any questions.`;
    setStatementEmailSending(true);
    try {
      const res = await fetch(`/api/clients/${id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setStatementEmailSent(true);
    } catch (err) {
      setPaymentLinkError(err.message);
    } finally {
      setStatementEmailSending(false);
    }
  }

  async function togglePaymentReminders(off) {
    setClient((c) => ({ ...c, payment_reminders_off: off }));
    const res = await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_reminders_off: off }),
    });
    if (!res.ok) {
      setClient((c) => ({ ...c, payment_reminders_off: !off }));
      alert('Could not save the payment reminder setting.');
    }
  }

  async function setSocialConsent(value) {
    const before = client.social_media_consent ?? null;
    setClient((c) => ({ ...c, social_media_consent: value }));
    const res = await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ social_media_consent: value }),
    });
    if (!res.ok) {
      setClient((c) => ({ ...c, social_media_consent: before }));
      alert('Could not save the social media consent.');
    }
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
      instagram_handle: client.instagram_handle ? `@${client.instagram_handle}` : '',
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
      body: JSON.stringify({
        amount,
        payment_method: legacyPaymentMethod,
        note: legacyPaymentNote,
        paid_at: legacyPaymentDate,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setRecordingLegacyPayment(false);
    if (!res.ok) {
      setLegacyPaymentError(data.error || 'Failed to record payment');
      return;
    }
    setLegacyPaymentAmount('');
    setLegacyPaymentMethod('');
    setLegacyPaymentNote('');
    setLegacyPaymentDate(new Date().toISOString().slice(0, 10));
    load();
  }

  // Adds a new Origin option to the staff-managed list (migration 155)
  // and selects it, instead of forcing whoever's recording a payment with
  // an unlisted origin to leave the amount unlogged.
  async function addLegacyPaymentMethod(e) {
    e.preventDefault();
    const name = newLegacyPaymentMethodName.trim();
    if (!name) {
      setLegacyPaymentMethodError('Enter a name for the new origin');
      return;
    }
    setSavingLegacyPaymentMethod(true);
    setLegacyPaymentMethodError(null);
    const res = await fetch('/api/accounting/legacy-payment-methods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingLegacyPaymentMethod(false);
    if (!res.ok) {
      setLegacyPaymentMethodError(data.error || 'Failed to add payment origin');
      return;
    }
    setLegacyPaymentMethods(data);
    const saved = data.find((m) => m.toLowerCase() === name.toLowerCase()) || name;
    setLegacyPaymentMethod(saved);
    setNewLegacyPaymentMethodName('');
    setAddingLegacyPaymentMethod(false);
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
  const lastReminder = reminderLog[0] || null;
  const nextReminder = client.payment_reminders_off ? null : nextReminderDate(outstandingInvoices, reminderLog, balanceDue);
  // "14 Sep": the year is noise in a list of recent open invoices.
  function dayMonth(iso) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  function ageLabel(createdAt) {
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
    if (days < 14) return `${days} d`;
    if (days < 60) return `${Math.floor(days / 7)} wk`;
    return `${Math.floor(days / 30)} mo`;
  }

  // A client with several pets can have outstanding invoices for more than
  // one of them — this list has no other way to tell those apart. Not
  // every invoice is tied to a patient (a standalone product sale isn't).
  function patientFor(inv) {
    return inv.visits?.patients || inv.hospitalizations?.patients;
  }

  return (
    <div>
      <p>
        <a href="/clients">&larr; Clients</a>
      </p>
      <h1>
        {client.full_name} <span>(Client #{client.client_number})</span>
      </h1>
      {/* Same layout as the patient page: Book, the More menu right next
          to it, then the case links (Consult / Invoice) in the pink oval.
          Chat stays out on the row since it's used all day. */}
      <div className="action-row">
        <a href={`/appointments?client_id=${client.id}`} className="button-link">
          📅 Book
        </a>
        <ActionMenu>
          <ActionMenu.Group label="Send the client a link" />
          <button type="button" onClick={sendBookingLink} disabled={sendingLink}
            title="WhatsApp the client a link to book an appointment themselves">
            {sendingLink ? 'Sending...' : '📅 Invite (booking link)'}
          </button>
          <button type="button" onClick={sendClientAppLink} title="WhatsApp the client a link to the Europets client app">
            📱 Client App link
          </button>
        </ActionMenu>
        {/* The real conversation thread (client_messages, same inbox as
            /messages, over the clinic's own WhatsApp number and the
            client app) — distinct from the openWhatsApp "draft a canned
            message from my own personal phone" buttons further down this
            page, hence the spelled-out label rather than reusing their
            "💬 WhatsApp" wording for something that behaves differently. */}
        <a href={`/messages/${client.id}`} className="button-link" title="Open this client's message thread — the clinic's own WhatsApp number and app chat, unified">
          💬 Chat
        </a>
        <CrossRecordLinks>
          <a href={`/consults?client_id=${client.id}`} className="button-link">
            Consult
          </a>
          <a href={`/invoices?client_id=${client.id}`} className="button-link">
            Invoice
          </a>
        </CrossRecordLinks>
      </div>
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
            Instagram (optional)
            <input
              value={editForm.instagram_handle}
              onChange={(e) => setEditForm({ ...editForm, instagram_handle: e.target.value })}
              placeholder="@username, so posts about their pet can tag them"
              autoCapitalize="none"
            />
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
          {client.trn ? ` · TRN: ${client.trn}` : ''}
          {client.instagram_handle ? (
            <>
              {' · '}
              <a href={`https://www.instagram.com/${client.instagram_handle}`} target="_blank" rel="noopener noreferrer">
                @{client.instagram_handle}
              </a>
            </>
          ) : null}{' '}
          <select
            className={`social-consent-chip social-consent-${client.social_media_consent === true ? 'yes' : client.social_media_consent === false ? 'no' : 'unasked'}`}
            value={client.social_media_consent === true ? 'yes' : client.social_media_consent === false ? 'no' : ''}
            onChange={(e) => setSocialConsent(e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null)}
            title="May we share photos and videos of their pets on Instagram and Facebook? Asked on the intake and consent forms."
          >
            <option value="">📸 Social: not asked</option>
            <option value="yes">📸 Social: yes</option>
            <option value="no">📸 Social: no</option>
          </select>{' '}
          <button type="button" onClick={startEdit}>
            Edit
          </button>
        </p>
      )}

      <div className="card financial-overview">
        <div className="financial-overview-head">
          <div className="financial-overview-total">
            <span className="financial-overview-total-label">Total Outstanding</span>
            <span className={`financial-overview-total-amount${totalOutstanding > 0 ? ' financial-overview-total-amount-due' : ''}`}>
              AED {money(totalOutstanding)}
            </span>
            {payLink?.credit > 0 && (
              <span className="financial-overview-credit" title="Paid in through their payment link, not needed yet: used automatically on their next invoice">
                +{money(payLink.credit)} credit
              </span>
            )}
          </div>
          <div className="financial-overview-auto">
            <label className="payment-reminders-toggle">
              <input
                type="checkbox"
                checked={!client.payment_reminders_off}
                onChange={(e) => togglePaymentReminders(!e.target.checked)}
              />
              Automatic reminders
              <InfoHint>Open invoices get a WhatsApp and email reminder at 2 weeks, 1 month and 2 months. Switch off for clients on account, insurance or a disputed bill.</InfoHint>
            </label>
            <span className="visit-meta">
              {client.payment_reminders_off
                ? 'Off for this client'
                : [
                    lastReminder ? `Last: ${stageShort(lastReminder.stage)}, ${dayMonth(lastReminder.sent_at)}` : 'None sent yet',
                    nextReminder ? `next: ${dayMonth(nextReminder)}` : null,
                  ].filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>

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
                <select
                  value={legacyPaymentMethod}
                  onChange={(e) => {
                    if (e.target.value === '__add_new__') {
                      setAddingLegacyPaymentMethod(true);
                      return;
                    }
                    setLegacyPaymentMethod(e.target.value);
                  }}
                >
                  <option value="">Select...</option>
                  {legacyPaymentMethods.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value="__add_new__">+ Add new origin...</option>
                </select>
              </label>
              {addingLegacyPaymentMethod && (
                <div className="legacy-balance-payment-form">
                  {legacyPaymentMethodError && <p className="error">{legacyPaymentMethodError}</p>}
                  <label>
                    New origin name
                    <input
                      type="text"
                      placeholder="e.g. Nomod, Tap, PayPal"
                      value={newLegacyPaymentMethodName}
                      onChange={(e) => setNewLegacyPaymentMethodName(e.target.value)}
                    />
                  </label>
                  <button type="button" onClick={addLegacyPaymentMethod} disabled={savingLegacyPaymentMethod}>
                    {savingLegacyPaymentMethod ? 'Adding...' : 'Add'}
                  </button>{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAddingLegacyPaymentMethod(false);
                      setNewLegacyPaymentMethodName('');
                      setLegacyPaymentMethodError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
              <label>
                Note (optional)
                <input
                  type="text"
                  placeholder="e.g. which old invoice this covers"
                  value={legacyPaymentNote}
                  onChange={(e) => setLegacyPaymentNote(e.target.value)}
                />
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


        <div className="financial-overview-actions">
          {totalOutstanding > 0 ? (
            <>
              <button type="button" onClick={sendOutstandingWhatsApp} disabled={!client.phone || outstandingSending === 'whatsapp'}
                title="Balance and a pay-everything link (with a statement download), from the clinic WhatsApp">
                {outstandingSending === 'whatsapp' ? 'Sending...' : <>💬 <span className="fo-long">Send on </span>WhatsApp</>}
              </button>
              <button type="button" onClick={sendOutstandingEmail} disabled={!client.email || outstandingSending === 'email'}
                title="Balance, each invoice, a pay-everything link and the statement">
                {outstandingSending === 'email' ? 'Sending...' : <>✉️ <span className="fo-long">Send by </span>Email</>}
              </button>
            </>
          ) : (
            <button type="button" onClick={sendStatementViaEmail} disabled={!client.email || statementEmailSending}>
              {statementEmailSending ? 'Sending...' : statementEmailSent ? '✅ Sent' : '✉️ Email statement'}
            </button>
          )}
          <button type="button" className="secondary" onClick={downloadStatement}>
            📄 <span className="fo-long">Statement </span>PDF
          </button>
          <button type="button" className={payLinkOpen ? '' : 'secondary'} onClick={openPayLink} disabled={payLinkBusy} aria-expanded={payLinkOpen}
            title="A personal link: anyone can pay any amount towards this client's account, applied to their bills automatically">
            💳 <span className="fo-long">Pay link</span><span className="fo-short">Link</span>
          </button>
        </div>
        {payLinkOpen && (
          <div className="pay-link-panel">
            {payLink?.link ? (
              <>
                <div className="pay-link-row">
                  <input type="text" readOnly value={payLink.link.url} onFocus={(e) => e.target.select()} aria-label="Payment link" />
                  <button type="button" className="secondary" onClick={copyPayLink}>Copy</button>
                  <button type="button" onClick={sendPayLink} disabled={!client.phone}>💬 Send</button>
                </div>
                <div className="pay-link-row">
                  {patients.length > 0 && (
                    <select value={payLink.link.patient_id || ''} onChange={(e) => savePayLink({ patient_id: e.target.value || null })} disabled={payLinkBusy} aria-label="Shown as for">
                      <option value="">For the whole account</option>
                      {patients.map((p) => (
                        <option key={p.id} value={p.id}>For {p.name}</option>
                      ))}
                    </select>
                  )}
                  <button type="button" className="secondary" onClick={newPayLink} disabled={payLinkBusy}>↻ New link</button>
                </div>
                <p className="visit-meta">Any amount from AED 20 to 5,000, as often as they like. Each payment shows in Online Payments, pays the oldest bills first within 10 minutes, and anything left is kept as credit for the next invoice.</p>
              </>
            ) : (
              <p className="visit-meta">{payLinkBusy ? 'Making the link...' : 'No link yet.'}</p>
            )}
            {payLinkNote && <p className={payLinkNote.startsWith('✅') ? 'visit-meta' : 'error'}>{payLinkNote}</p>}
          </div>
        )}
        {paymentLinkError && <p className={paymentLinkError.startsWith('✅') || paymentLinkError.startsWith('Opened') ? 'visit-meta' : 'error'}>{paymentLinkError}</p>}

        {outstandingInvoices.length > 0 ? (
          <>
            <div className="financial-overview-table-wrap">
            <table className="financial-overview-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Pet</th>
                  <th>Due</th>
                  <th>Age</th>
                  <th>Reminded</th>
                </tr>
              </thead>
              <tbody>
                {(showAllOutstanding ? outstandingInvoices : outstandingInvoices.slice(0, 5)).map((inv) => {
                  const patient = patientFor(inv);
                  const reminded = reminderLog.find((r) => r.invoice_id === inv.id);
                  return (
                    <tr key={inv.id}>
                      <td>
                        <a href={`/invoices/${inv.id}`}>{invoiceLabel(inv)}</a>
                      </td>
                      <td>{dayMonth(inv.created_at)}</td>
                      <td>{patient ? patient.name : '—'}</td>
                      <td>
                        AED {money(balanceDue(inv))}
                        {inv.status === 'partially_paid' && <span className="visit-meta"> part paid</span>}
                      </td>
                      <td>{ageLabel(inv.created_at)}</td>
                      <td>{reminded ? `🔔 ${stageShort(reminded.stage)}, ${dayMonth(reminded.sent_at)}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {outstandingInvoices.length > 5 && (
              <button type="button" className="secondary financial-overview-more" onClick={() => setShowAllOutstanding((v) => !v)}>
                {showAllOutstanding ? 'Show fewer' : `Show all ${outstandingInvoices.length}`}
              </button>
            )}
          </>
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
