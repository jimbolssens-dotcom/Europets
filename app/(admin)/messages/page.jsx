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
    } catch (err) {
      setBookingTemplateResult({ ok: false, message: err.message });
    }
    setSubmittingBookingTemplate(false);
  }

  return (
    <>
      <div className="page-header">
        <h1>Messages</h1>
      </div>

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
        </button>
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
        </button>
        {bookingTemplateResult && (
          <span className={bookingTemplateResult.ok ? '' : 'error'}> {bookingTemplateResult.message}</span>
        )}
      </p>

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
