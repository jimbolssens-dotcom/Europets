// app/messages/page.jsx
// Staff inbox for general client conversations — the client app's own chat
// (migration 120) and WhatsApp (migration 130) folded into one list, one
// row per conversation, newest first, exactly like the day-procedures/
// hospitalization lists' table-of-records pattern. A client waiting on a
// reply (their last message hasn't been answered) gets the same amber
// "needs attention" row highlight as a cage/nav link elsewhere in the app
// (.cage-update-requested) — see app/(admin)/layout.js for the matching
// nav badge + alert chime.
//
// A WhatsApp message from a number not yet linked to any client (a new
// inquiry, a wrong number) has no client_id to route a normal thread page
// to — those sit in their own section below, expandable in place (same
// pattern as the invoices list's row expansion) rather than a page of
// their own, with a reply box and a "link to client" search right there.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ClientOrPatientSearch from '@/app/_components/ClientOrPatientSearch';

function formatWhen(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function preview(text) {
  if (!text) return '';
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

// The little mark next to each "Submit ... WhatsApp template" button below
// — reflects Meta's own status for that template (see GET
// /api/whatsapp/template-statuses), not just "was this clicked before".
// Nothing renders for a template never submitted, so a bare button still
// reads as "not done yet" with no mark needed.
function TemplateStatusMark({ status }) {
  if (!status) return null;
  if (status === 'APPROVED') return <span className="template-status template-status-approved">✅ Approved</span>;
  if (status === 'PENDING') return <span className="template-status template-status-pending">⏳ Pending Meta review</span>;
  if (status === 'REJECTED') return <span className="template-status template-status-rejected">❌ Rejected — resubmit</span>;
  return <span className="template-status">{status}</span>;
}

function UnmatchedThreadRow({ conv, staff, onLinked }) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyStaffId, setReplyStaffId] = useState('');
  const [sending, setSending] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState(null);

  const phone = conv.phone;

  const loadMessages = () =>
    fetch(`/api/client-messages/unmatched/${encodeURIComponent(phone)}`)
      .then((res) => res.json())
      .then((data) => setMessages(Array.isArray(data) ? data : []));

  useEffect(() => {
    if (!expanded) return;
    setLoading(true);
    loadMessages().finally(() => setLoading(false));

    // Opening this row clears its 🔔 alarm on its own, same as opening a
    // matched client's thread page — see PATCH /api/client-messages/thread-state.
    fetch('/api/client-messages/thread-state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_key: `phone:${phone}`, mark_read: true }),
    }).then(onLinked);

    const channel = supabase
      .channel(`unmatched-whatsapp-${phone}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'client_messages', filter: `phone=eq.${phone}` },
        loadMessages
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, phone]);

  async function toggleFlagged() {
    await fetch('/api/client-messages/thread-state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_key: `phone:${phone}`, flagged: !conv.flagged }),
    });
    onLinked();
  }

  async function sendReply(e) {
    e.preventDefault();
    const text = replyDraft.trim();
    if (!text || !replyStaffId) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/client-messages/unmatched/${encodeURIComponent(phone)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text, staff_id: replyStaffId }),
    });
    setSending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to send');
      return;
    }
    setReplyDraft('');
    loadMessages();
  }

  async function linkToClient(clientId) {
    if (!clientId) return;
    setLinking(true);
    setError(null);
    const res = await fetch(`/api/client-messages/unmatched/${encodeURIComponent(phone)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId }),
    });
    setLinking(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to link');
      return;
    }
    onLinked();
  }

  return (
    <>
      <tr className={conv.pending ? 'cage-update-requested' : ''}>
        <td>{conv.pending && '🔔'}</td>
        <td>
          <button type="button" className="button-link" onClick={() => setExpanded((v) => !v)}>
            {phone} <span className="visit-meta">(unmatched WhatsApp)</span>
          </button>
        </td>
        <td>
          {conv.last_sender === 'staff' ? 'You: ' : ''}
          {preview(conv.last_message)}
        </td>
        <td>{formatWhen(conv.last_message_at)}</td>
        <td>
          <button type="button" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Close' : 'Open'}
          </button>{' '}
          <button type="button" onClick={toggleFlagged} title={conv.flagged ? 'Clear the needs-attention flag' : 'Flag as still needing attention'}>
            {conv.flagged ? '🔔' : '🏳️'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5}>
            {error && <p className="error">{error}</p>}
            {loading ? (
              <p>Loading...</p>
            ) : (
              <div className="portal-chat-thread staff-chat-thread">
                {messages.length === 0 && <p className="visit-meta">No messages yet.</p>}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`portal-chat-bubble portal-chat-bubble-${m.sender === 'staff' ? 'mine' : 'theirs'}`}
                  >
                    {m.media_url && (
                      <a href={m.media_url} target="_blank" rel="noopener noreferrer">
                        <img src={m.media_url} alt="" className="portal-chat-bubble-image" />
                      </a>
                    )}
                    {m.body && <p>{m.body}</p>}
                    <span className="portal-chat-bubble-meta">
                      {m.sender === 'staff' ? m.staff?.full_name || 'Staff' : phone} · {formatWhen(m.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="hospitalization-chat">
              <form className="portal-chat-form" onSubmit={sendReply}>
                <select value={replyStaffId} onChange={(e) => setReplyStaffId(e.target.value)} required>
                  <option value="">Replying as...</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
                <textarea
                  rows={2}
                  placeholder="Reply..."
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                />
                <button type="submit" disabled={sending || !replyDraft.trim() || !replyStaffId}>
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </form>
            </div>

            <div className="note-form">
              <p className="visit-meta">Not a client yet, or want to link this number to an existing one?</p>
              <ClientOrPatientSearch
                placeholder="Search clients or patients to link this number..."
                onPickClient={(c) => linkToClient(c.id)}
                onPickPatient={(p) => linkToClient(p.client_id)}
              />
              {linking && <p className="visit-meta">Linking...</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function MessagesInboxPage() {
  const [conversations, setConversations] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeResult, setSubscribeResult] = useState(null); // { ok: boolean, message: string } | null
  const [submittingFirstContact, setSubmittingFirstContact] = useState(false);
  const [firstContactResult, setFirstContactResult] = useState(null); // { ok: boolean, message: string } | null
  const [submittingBookingTemplate, setSubmittingBookingTemplate] = useState(false);
  const [bookingTemplateResult, setBookingTemplateResult] = useState(null); // { ok: boolean, message: string } | null
  const [submittingHospitalizationTemplate, setSubmittingHospitalizationTemplate] = useState(false);
  const [hospitalizationTemplateResult, setHospitalizationTemplateResult] = useState(null); // { ok: boolean, message: string } | null
  const [submittingIntakeTemplate, setSubmittingIntakeTemplate] = useState(false);
  const [intakeTemplateResult, setIntakeTemplateResult] = useState(null); // { ok: boolean, message: string } | null
  const [submittingClientAppLinkTemplate, setSubmittingClientAppLinkTemplate] = useState(false);
  const [clientAppLinkTemplateResult, setClientAppLinkTemplateResult] = useState(null); // { ok: boolean, message: string } | null
  const [hasPendingInviteRequest, setHasPendingInviteRequest] = useState(false);
  const [submittingDischargeFollowupTemplate, setSubmittingDischargeFollowupTemplate] = useState(false);
  const [dischargeFollowupTemplateResult, setDischargeFollowupTemplateResult] = useState(null); // { ok: boolean, message: string } | null
  const [templateStatuses, setTemplateStatuses] = useState({}); // { [purpose]: 'APPROVED' | 'PENDING' | 'REJECTED' | null }
  const [checkingQuality, setCheckingQuality] = useState(false);
  const [qualityResult, setQualityResult] = useState(null); // { ok: boolean, data? } | null

  const load = () =>
    fetch('/api/client-messages')
      .then((res) => res.json())
      .then((data) => {
        setConversations(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    load();
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => setStaff(Array.isArray(data) ? data : []));

    const channel = supabase
      .channel('messages-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_messages' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ground truth for the little ✅/⏳/❌ mark next to each "Submit ...
  // template" button below — asks Meta directly rather than remembering
  // "was clicked" locally, so it's still right after a reload or for a
  // different staff member, and reflects a later rejection too. Best-effort:
  // silently leaves every mark blank if this fails (e.g. WABA ID not set
  // yet) rather than blocking the page.
  const loadTemplateStatuses = () =>
    fetch('/api/whatsapp/template-statuses')
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setTemplateStatuses(data && !data.error ? data : {}))
      .catch(() => {});

  useEffect(() => {
    loadTemplateStatuses();
  }, []);

  // Invite's own pending-review bell, now that Invite lives on a pill here
  // instead of the top nav bar (see app/(admin)/layout.js) — a submitted
  // intake/invite request with no appointment slot requested (those are
  // reviewed on Appointments instead).
  useEffect(() => {
    const checkPendingInvite = () =>
      fetch('/api/intake-requests')
        .then((res) => res.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          setHasPendingInviteRequest(list.some((r) => r.status === 'submitted' && !r.appointment_type));
        });

    checkPendingInvite();

    const channel = supabase
      .channel('messages-pill-intake-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intake_requests' }, checkPendingInvite)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const matched = conversations.filter((c) => c.client_id);
  const unmatched = conversations.filter((c) => !c.client_id && c.phone);

  async function fixWhatsAppSubscription() {
    setSubscribing(true);
    setSubscribeResult(null);
    try {
      const res = await fetch('/api/whatsapp/subscribe', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setSubscribeResult({ ok: true, message: 'Done — this number is now subscribed to receive WhatsApp messages here.' });
    } catch (err) {
      setSubscribeResult({ ok: false, message: err.message });
    }
    setSubscribing(false);
  }

  async function checkPhoneQuality() {
    setCheckingQuality(true);
    setQualityResult(null);
    try {
      const res = await fetch('/api/whatsapp/phone-quality');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setQualityResult({ ok: true, data });
    } catch (err) {
      setQualityResult({ ok: false, message: err.message });
    }
    setCheckingQuality(false);
  }

  async function submitFirstContactTemplate() {
    setSubmittingFirstContact(true);
    setFirstContactResult(null);
    try {
      const res = await fetch('/api/whatsapp/create-first-contact-template', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setFirstContactResult({
        ok: true,
        message:
          'Submitted — check WhatsApp Manager > Account tools > Message templates for Meta\'s approval status (usually within a day).',
      });
      loadTemplateStatuses();
    } catch (err) {
      setFirstContactResult({ ok: false, message: err.message });
    }
    setSubmittingFirstContact(false);
  }

  async function submitBookingConfirmationTemplate() {
    setSubmittingBookingTemplate(true);
    setBookingTemplateResult(null);
    try {
      const res = await fetch('/api/whatsapp/create-booking-confirmation-template', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setBookingTemplateResult({
        ok: true,
        message:
          'Submitted — check WhatsApp Manager > Account tools > Message templates for Meta\'s approval status (usually within a day).',
      });
      loadTemplateStatuses();
    } catch (err) {
      setBookingTemplateResult({ ok: false, message: err.message });
    }
    setSubmittingBookingTemplate(false);
  }

  async function submitHospitalizationPortalTemplate() {
    setSubmittingHospitalizationTemplate(true);
    setHospitalizationTemplateResult(null);
    try {
      const res = await fetch('/api/whatsapp/create-hospitalization-portal-template', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setHospitalizationTemplateResult({
        ok: true,
        message:
          'Submitted — check WhatsApp Manager > Account tools > Message templates for Meta\'s approval status (usually within a day).',
      });
      loadTemplateStatuses();
    } catch (err) {
      setHospitalizationTemplateResult({ ok: false, message: err.message });
    }
    setSubmittingHospitalizationTemplate(false);
  }

  async function submitIntakeTemplate() {
    setSubmittingIntakeTemplate(true);
    setIntakeTemplateResult(null);
    try {
      const res = await fetch('/api/whatsapp/create-intake-template', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setIntakeTemplateResult({
        ok: true,
        message:
          'Submitted — check WhatsApp Manager > Account tools > Message templates for Meta\'s approval status (usually within a day).',
      });
      loadTemplateStatuses();
    } catch (err) {
      setIntakeTemplateResult({ ok: false, message: err.message });
    }
    setSubmittingIntakeTemplate(false);
  }

  async function submitClientAppLinkTemplate() {
    setSubmittingClientAppLinkTemplate(true);
    setClientAppLinkTemplateResult(null);
    try {
      const res = await fetch('/api/whatsapp/create-client-app-link-template', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setClientAppLinkTemplateResult({
        ok: true,
        message:
          'Submitted — check WhatsApp Manager > Account tools > Message templates for Meta\'s approval status (usually within a day).',
      });
      loadTemplateStatuses();
    } catch (err) {
      setClientAppLinkTemplateResult({ ok: false, message: err.message });
    }
    setSubmittingClientAppLinkTemplate(false);
  }

  async function submitDischargeFollowupTemplate() {
    setSubmittingDischargeFollowupTemplate(true);
    setDischargeFollowupTemplateResult(null);
    try {
      const res = await fetch('/api/whatsapp/create-discharge-followup-template', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setDischargeFollowupTemplateResult({
        ok: true,
        message:
          'Submitted — check WhatsApp Manager > Account tools > Message templates for Meta\'s approval status (usually within a day).',
      });
      loadTemplateStatuses();
    } catch (err) {
      setDischargeFollowupTemplateResult({ ok: false, message: err.message });
    }
    setSubmittingDischargeFollowupTemplate(false);
  }

  return (
    <>
      <div className="page-header">
        <h1>Messages</h1>
        {/* Invite, Follow-ups, and Vaccinations moved here off the top nav
            bar (see app/(admin)/layout.js) — all three are really about
            messages going out, or waiting to go out, to clients, so they
            live as pills next to the heading rather than cluttering the
            main bar. Each is still just a plain link to its own unchanged
            page. */}
        <div className="hospitalization-header-actions">
          <a href="/intake" className="button-link">
            ✉️ Invite{hasPendingInviteRequest && ' 🔔'}
          </a>
          <a href="/follow-ups" className="button-link">
            📋 Follow-ups
          </a>
          <a href="/vaccinations" className="button-link">
            💉 Vaccinations
          </a>
        </div>
      </div>

      {/* All three below are one-time setup actions (fix the subscription,
          submit a template) — done once and rarely touched again, so they
          sat as permanent clutter above the inbox everyone actually reads
          daily. Tucked into a closed disclosure instead of removed
          outright: the subscription fix may be needed again if it ever
          drops, and a template can need resubmitting after Meta rejects
          it or its wording changes. */}
      <details className="messages-setup-toggle">
        <summary>⚙️ WhatsApp setup</summary>

        {/* One-time fix for a webhook that's configured correctly in Meta App
            Dashboard (verified, published, "messages" subscribed) but still
            isn't receiving anything — the phone number itself also has to be
            explicitly subscribed, a step Meta's dashboard gives no indication
            of missing. Safe to click more than once. */}
        <p className="visit-meta">
          Not receiving WhatsApp messages here even though the webhook looks configured in Meta?{' '}
          <button type="button" onClick={fixWhatsAppSubscription} disabled={subscribing}>
            {subscribing ? 'Fixing…' : 'Fix WhatsApp subscription'}
          </button>
          {subscribeResult && (
            <span className={subscribeResult.ok ? '' : 'error'}> {subscribeResult.message}</span>
          )}
        </p>

        {/* Diagnostic for a "failed" send whose ⚠️ Not delivered reason
            doesn't point at template approval or the 24h window — Meta
            throttles/blocks a number whose Quality Rating has dropped,
            independent of any one template's own approval status. */}
        <p className="visit-meta">
          A message failed for an unclear reason?{' '}
          <button type="button" onClick={checkPhoneQuality} disabled={checkingQuality}>
            {checkingQuality ? 'Checking…' : 'Check number quality rating'}
          </button>
          {qualityResult && qualityResult.ok && (
            <span>
              {' '}
              {qualityResult.data.display_phone_number || 'This number'} — Quality:{' '}
              <strong>{qualityResult.data.quality_rating || 'unknown'}</strong>, Messaging limit:{' '}
              <strong>{qualityResult.data.messaging_limit_tier || 'unknown'}</strong>
            </span>
          )}
          {qualityResult && !qualityResult.ok && <span className="error"> {qualityResult.message}</span>}
        </p>

        {/* One-time setup so a text reply to a client with no open WhatsApp
            window (never messaged this number, or not in the last 24h)
            actually reaches them — a plain reply can otherwise be silently
            accepted by Meta's API and then never delivered (see POST
            /api/clients/:id/messages and the ⚠️ Not delivered status shown
            in a thread when that happens). */}
        <p className="visit-meta">
          Set up the first-contact WhatsApp template (one-time, needs Meta's approval before it goes live):{' '}
          <button type="button" onClick={submitFirstContactTemplate} disabled={submittingFirstContact}>
            {submittingFirstContact ? 'Submitting…' : 'Submit first-contact WhatsApp template'}
          </button>{' '}
          <TemplateStatusMark status={templateStatuses.firstContact} />
          {firstContactResult && (
            <span className={firstContactResult.ok ? '' : 'error'}> {firstContactResult.message}</span>
          )}
        </p>

        {/* One-time setup so approving a client's booking request (submitted
            via the client app or an Invite link) sends its confirmation from
            the clinic's own WhatsApp Business number automatically, instead
            of staff having to send it by hand from their own personal
            WhatsApp — see the auto-send in POST /api/intake-requests/:id
            and lib/useIntakeReview.js's manual fallback for when this
            template isn't approved yet. */}
        <p className="visit-meta">
          Set up the booking-confirmation WhatsApp template (one-time, needs Meta's approval before it goes live):{' '}
          <button type="button" onClick={submitBookingConfirmationTemplate} disabled={submittingBookingTemplate}>
            {submittingBookingTemplate ? 'Submitting…' : 'Submit booking-confirmation WhatsApp template'}
          </button>{' '}
          <TemplateStatusMark status={templateStatuses.bookingConfirmation} />
          {bookingTemplateResult && (
            <span className={bookingTemplateResult.ok ? '' : 'error'}> {bookingTemplateResult.message}</span>
          )}
        </p>

        {/* One-time setup so sending a hospitalized patient's client-portal
            link (the "Share" button on the hospitalization page) goes out
            from the clinic's own WhatsApp Business number automatically,
            instead of opening staff's own personal WhatsApp for them to
            send by hand — see the auto-send in POST
            /api/hospitalizations/:id/send-portal-link and that page's
            shareViaWhatsApp for the manual fallback when this template
            isn't approved yet. */}
        <p className="visit-meta">
          Set up the hospitalization portal-link WhatsApp template (one-time, needs Meta's approval before it goes live):{' '}
          <button type="button" onClick={submitHospitalizationPortalTemplate} disabled={submittingHospitalizationTemplate}>
            {submittingHospitalizationTemplate ? 'Submitting…' : 'Submit hospitalization portal-link WhatsApp template'}
          </button>{' '}
          <TemplateStatusMark status={templateStatuses.hospitalizationPortal} />
          {hospitalizationTemplateResult && (
            <span className={hospitalizationTemplateResult.ok ? '' : 'error'}> {hospitalizationTemplateResult.message}</span>
          )}
        </p>

        {/* One-time setup so the Invite page's "New Patient Intake" send
            and resend buttons go out from the clinic's own WhatsApp
            Business number automatically, instead of opening staff's own
            personal WhatsApp for them to send by hand — see the auto-send
            in POST /api/intake-requests/:id/send-whatsapp and that page's
            sendIntakeWhatsApp for the manual fallback when this template
            isn't approved yet. */}
        <p className="visit-meta">
          Set up the new-patient-intake WhatsApp template (one-time, needs Meta's approval before it goes live):{' '}
          <button type="button" onClick={submitIntakeTemplate} disabled={submittingIntakeTemplate}>
            {submittingIntakeTemplate ? 'Submitting…' : 'Submit intake-link WhatsApp template'}
          </button>{' '}
          <TemplateStatusMark status={templateStatuses.intakeLink} />
          {intakeTemplateResult && (
            <span className={intakeTemplateResult.ok ? '' : 'error'}> {intakeTemplateResult.message}</span>
          )}
        </p>

        {/* One-time setup so the Invite page's "Client App Link" button
            goes out from the clinic's own WhatsApp Business number
            automatically — see the auto-send in POST
            /api/client-app-link/send and that page's sendClientAppLink
            for the manual fallback when this template isn't approved
            yet. */}
        <p className="visit-meta">
          Set up the client-app-link WhatsApp template (one-time, needs Meta's approval before it goes live):{' '}
          <button type="button" onClick={submitClientAppLinkTemplate} disabled={submittingClientAppLinkTemplate}>
            {submittingClientAppLinkTemplate ? 'Submitting…' : 'Submit client-app-link WhatsApp template'}
          </button>{' '}
          <TemplateStatusMark status={templateStatuses.clientAppLink} />
          {clientAppLinkTemplateResult && (
            <span className={clientAppLinkTemplateResult.ok ? '' : 'error'}> {clientAppLinkTemplateResult.message}</span>
          )}
        </p>

        {/* One-time setup so the post-discharge "how's recovery going?"
            check-ins (see app/(admin)/follow-ups and
            lib/dischargeFollowups.js) go out under their own branded
            template instead of the generic first-contact one — see the
            auto-send in lib/dischargeFollowups.js's sendDischargeFollowup. */}
        <p className="visit-meta">
          Set up the discharge follow-up WhatsApp template (one-time, needs Meta's approval before it goes live):{' '}
          <button type="button" onClick={submitDischargeFollowupTemplate} disabled={submittingDischargeFollowupTemplate}>
            {submittingDischargeFollowupTemplate ? 'Submitting…' : 'Submit discharge follow-up WhatsApp template'}
          </button>{' '}
          <TemplateStatusMark status={templateStatuses.dischargeFollowup} />
          {dischargeFollowupTemplateResult && (
            <span className={dischargeFollowupTemplateResult.ok ? '' : 'error'}> {dischargeFollowupTemplateResult.message}</span>
          )}
        </p>
      </details>

      {loading ? (
        <p>Loading...</p>
      ) : conversations.length === 0 ? (
        <p>No conversations yet — messages clients send from the client app or WhatsApp will show up here.</p>
      ) : (
        <>
          {matched.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Client</th>
                  <th>Last message</th>
                  <th>When</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {matched.map((c) => (
                  <tr key={c.client_id} className={c.pending ? 'cage-update-requested' : ''}>
                    <td>{c.pending && '🔔'}</td>
                    <td>
                      <a href={`/clients/${c.client_id}`}>
                        {c.client?.full_name}
                        {c.client?.client_number ? ` (Client #${c.client.client_number})` : ''}
                      </a>
                      <span className="visit-meta"> · {c.channel === 'whatsapp' ? 'WhatsApp' : 'App'}</span>
                    </td>
                    <td>
                      {c.last_sender === 'staff' ? 'You: ' : c.last_sender === 'ai' ? '🤖 ' : ''}
                      {preview(c.last_message)}
                    </td>
                    <td>{formatWhen(c.last_message_at)}</td>
                    <td>
                      <a href={`/messages/${c.client_id}`} className="button-link button-link-open">
                        Open
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {unmatched.length > 0 && (
            <>
              <h3>Unmatched WhatsApp numbers</h3>
              <p className="visit-meta">
                Messages from a number that isn&apos;t linked to a client yet — reply below, or link it to a client to
                fold it into their normal conversation.
              </p>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Number</th>
                    <th>Last message</th>
                    <th>When</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {unmatched.map((c) => (
                    <UnmatchedThreadRow key={c.thread_key} conv={c} staff={staff} onLinked={load} />
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </>
  );
}
