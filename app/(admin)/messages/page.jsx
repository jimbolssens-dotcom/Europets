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
// — reflects Meta's own status AND category for that template (see GET
// /api/whatsapp/template-statuses), not just "was this clicked before".
// Nothing renders for a template never submitted, so a bare button still
// reads as "not done yet" with no mark needed. Category matters as much as
// status: every template here is submitted as UTILITY (transactional,
// not subject to per-recipient send limits), but Meta can silently
// recategorize one as MARKETING during review — that's a real, separate
// failure mode from approval, so it's flagged loudly rather than buried.
function TemplateStatusMark({ status }) {
  if (!status) return null;
  const { status: approvalStatus, category } = status;
  const statusMark =
    approvalStatus === 'APPROVED' ? (
      <span className="template-status template-status-approved">✅ Approved</span>
    ) : approvalStatus === 'PENDING' ? (
      <span className="template-status template-status-pending">⏳ Pending Meta review</span>
    ) : approvalStatus === 'REJECTED' ? (
      <span className="template-status template-status-rejected">❌ Rejected — resubmit</span>
    ) : (
      <span className="template-status">{approvalStatus}</span>
    );
  return (
    <>
      {statusMark}
      {category && category !== 'UTILITY' && (
        <span className="template-status template-status-rejected">
          {' '}
          ⚠️ Meta recategorized this as {category} — subject to per-recipient send limits
        </span>
      )}
    </>
  );
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
    checkPhoneQuality();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      {/* One-time/rarely-touched setup actions, collapsed by default so
          they don't compete with the inbox everyone reads daily. Within
          it, a template already ✅ Approved with no MARKETING flag needs
          no attention day-to-day — those collapse into their own nested
          group below, so only what's actually pending/rejected/flagged
          stays visible at a glance. */}
      <details className="messages-setup-toggle">
        <summary>⚙️ WhatsApp setup</summary>

        {/* One-time fix for a webhook that's configured correctly in Meta App
            Dashboard (verified, published, "messages" subscribed) but still
            isn't receiving anything — the phone number itself also has to be
            explicitly subscribed, a step Meta's dashboard gives no indication
            of missing. Safe to click more than once. */}
        <div className="whatsapp-setup-row">
          <span>Not receiving WhatsApp messages here even though the webhook looks configured in Meta?</span>
          <span>
            <button type="button" onClick={fixWhatsAppSubscription} disabled={subscribing}>
              {subscribing ? 'Fixing…' : 'Fix subscription'}
            </button>
            {subscribeResult && <span className={subscribeResult.ok ? '' : 'error'}> {subscribeResult.message}</span>}
          </span>
        </div>

        {/* Diagnostic for a "failed" send whose ⚠️ Not delivered reason
            doesn't point at template approval or the 24h window — Meta
            throttles/blocks a number whose Quality Rating has dropped,
            independent of any one template's own approval status. Loaded
            automatically (see the useEffect above) rather than behind a
            button — it's one Graph API call, cheap enough to always show. */}
        <div className="whatsapp-setup-row">
          <span>Number quality</span>
          <span>
            {checkingQuality && 'Checking…'}
            {qualityResult && qualityResult.ok && (
              <>
                <strong>{qualityResult.data.quality_rating || 'unknown'}</strong>
                {qualityResult.data.messaging_limit_tier && ` · limit ${qualityResult.data.messaging_limit_tier}`}
              </>
            )}
            {qualityResult && !qualityResult.ok && <span className="error">{qualityResult.message}</span>}
          </span>
        </div>

        {(() => {
          // Each template's one-time "submit for Meta review" setup — see
          // the individual submit* handlers above for what each unlocks
          // and what manual fallback it replaces. Split below into what
          // still needs a look (never submitted, pending, rejected, or
          // approved but MARKETING-flagged) vs. fully done.
          const templates = [
            { key: 'firstContact', label: 'First-contact', onSubmit: submitFirstContactTemplate, submitting: submittingFirstContact, result: firstContactResult },
            { key: 'bookingConfirmation', label: 'Booking-confirmation', onSubmit: submitBookingConfirmationTemplate, submitting: submittingBookingTemplate, result: bookingTemplateResult },
            { key: 'hospitalizationPortal', label: 'Hospitalization portal-link', onSubmit: submitHospitalizationPortalTemplate, submitting: submittingHospitalizationTemplate, result: hospitalizationTemplateResult },
            { key: 'intakeLink', label: 'New-patient-intake', onSubmit: submitIntakeTemplate, submitting: submittingIntakeTemplate, result: intakeTemplateResult },
            { key: 'clientAppLink', label: 'Client-app-link', onSubmit: submitClientAppLinkTemplate, submitting: submittingClientAppLinkTemplate, result: clientAppLinkTemplateResult },
            { key: 'dischargeFollowup', label: 'Discharge follow-up', onSubmit: submitDischargeFollowupTemplate, submitting: submittingDischargeFollowupTemplate, result: dischargeFollowupTemplateResult },
          ];
          const needsAttention = (t) => {
            const s = templateStatuses[t.key];
            return !s || s.status !== 'APPROVED' || (s.category && s.category !== 'UTILITY');
          };
          const attention = templates.filter(needsAttention);
          const done = templates.filter((t) => !needsAttention(t));

          const row = (t) => (
            <div className="whatsapp-setup-row" key={t.key}>
              <span>{t.label}</span>
              <span>
                <TemplateStatusMark status={templateStatuses[t.key]} />{' '}
                <button type="button" onClick={t.onSubmit} disabled={t.submitting}>
                  {t.submitting ? 'Submitting…' : 'Submit'}
                </button>
                {t.result && <span className={t.result.ok ? '' : 'error'}> {t.result.message}</span>}
              </span>
            </div>
          );

          return (
            <>
              {attention.map(row)}
              {done.length > 0 && (
                <details className="whatsapp-setup-done-group">
                  <summary>
                    ✅ {done.length} template{done.length === 1 ? '' : 's'} approved, no action needed
                  </summary>
                  {done.map(row)}
                </details>
              )}
            </>
          );
        })()}
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
