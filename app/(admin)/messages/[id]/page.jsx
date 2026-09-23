// app/messages/[id]/page.jsx
// One client's general chat thread — the staff side of the client app's
// "Messages" feature (see client_messages / migration 120). Same chat
// bubble markup/CSS and "Replying as..." staff-picker convention as the
// hospitalization chat on app/(admin)/hospitalization/[id]/page.jsx, just
// standing on its own page instead of a collapsible panel, and scoped to a
// client instead of one admission. Enter sends (Shift+Enter for a new
// line); 📷/📎 attach a photo/file, uploaded to Storage then sent as
// WhatsApp media or logged straight onto the row for the app channel (see
// lib/attachments.js's uploadClientMessageMedia and POST /api/clients/
// :id/messages).

'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { formatDateTime } from '@/lib/formatTimestamp';
import { uploadClientMessageMedia } from '@/lib/attachments';

export default function ClientMessageThreadPage() {
  const { id } = useParams();
  const router = useRouter();
  const [client, setClient] = useState(null);
  const [staff, setStaff] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyStaffId, setReplyStaffId] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [channelOverride, setChannelOverride] = useState(null); // 'app' | 'whatsapp' | null (auto)
  const [flagged, setFlagged] = useState(false);
  const [error, setError] = useState(null);
  const threadRef = useRef(null);
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setChannelOverride(null);
    const loadMessages = () =>
      fetch(`/api/clients/${id}/messages`)
        .then((res) => res.json())
        .then((data) => setMessages(Array.isArray(data) ? data : []));

    Promise.all([
      fetch(`/api/clients/${id}`).then((res) => (res.ok ? res.json() : null)),
      fetch('/api/staff').then((res) => res.json()),
      loadMessages(),
    ]).then(([clientData, staffData]) => {
      setClient(clientData);
      setStaff(Array.isArray(staffData) ? staffData : []);
      setLoading(false);
    });

    const channel = supabase
      .channel(`client-messages-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'client_messages', filter: `client_id=eq.${id}` },
        loadMessages
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [id]);

  // Opening this thread clears the inbox's 🔔 alarm for it on its own —
  // "closing it again without replying" used to leave the alarm on
  // forever, since nothing recorded that staff had actually looked at it.
  // Fires once per visit (not on every realtime message tick after that)
  // so it matches "I opened this conversation", not "I'm still staring at
  // it" — see PATCH/GET /api/client-messages/thread-state.
  useEffect(() => {
    fetch('/api/client-messages/thread-state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_key: id, mark_read: true }),
    });
    fetch(`/api/client-messages/thread-state?thread_key=${encodeURIComponent(id)}`)
      .then((res) => res.json())
      .then((data) => setFlagged(Boolean(data?.flagged)));
  }, [id]);

  async function toggleFlagged() {
    const next = !flagged;
    setFlagged(next);
    await fetch('/api/client-messages/thread-state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_key: id, flagged: next }),
    });
  }

  useEffect(() => {
    // Also depends on `loading`, not just `messages`: the thread <div> (and
    // this ref) doesn't exist until loading flips to false, but messages was
    // already set moments earlier in the same load — same reference, so this
    // effect wouldn't otherwise rerun on the one render where the ref first
    // becomes non-null, and the page would silently open scrolled to the top.
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // A client only counts as an app user if they've actually opened it
  // recently — same 60-day "recently" and the same field as the
  // hospitalization page's usesClientApp, reused here for the same reason:
  // most clients have never opened the client app at all, so a brand-new
  // thread (no messages yet — nothing to infer a channel from) should
  // default to WhatsApp, not silently fall back to 'app' just because
  // that happens to be this route's technical default.
  const clientAppLastSeenAt = client?.client_app_last_seen_at;
  const usesClientApp =
    !!clientAppLastSeenAt && Date.now() - new Date(clientAppLastSeenAt).getTime() < 60 * 24 * 60 * 60 * 1000;

  // currentChannel: an explicit pick (the toggle below) always wins;
  // otherwise reply on whichever channel the conversation is already
  // happening on — the same channel the most recent message came in
  // through, so an ongoing WhatsApp conversation naturally stays one —
  // and only fall back to the app-usage guess above for a thread with no
  // messages at all yet.
  function currentChannel() {
    if (channelOverride) return channelOverride;
    if (messages.length > 0) return messages[messages.length - 1]?.channel === 'whatsapp' ? 'whatsapp' : 'app';
    return usesClientApp ? 'app' : 'whatsapp';
  }

  async function postReply(extra) {
    const res = await fetch(`/api/clients/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: replyStaffId, channel: currentChannel(), ...extra }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to send');
      return false;
    }
    setReplyDraft('');
    // Don't wait on realtime for the reply to show up — same as the
    // hospitalization chat's sendReply, which also reloads immediately
    // rather than relying solely on the postgres_changes subscription.
    fetch(`/api/clients/${id}/messages`)
      .then((r) => r.json())
      .then((data) => setMessages(Array.isArray(data) ? data : []));
    return true;
  }

  // e is undefined when called from the Enter-to-send keydown handler
  // rather than an actual form submit.
  async function sendReply(e) {
    e?.preventDefault();
    const text = replyDraft.trim();
    if (!text || !replyStaffId) return;
    setSendingReply(true);
    setError(null);
    await postReply({ body: text });
    setSendingReply(false);
  }

  function handleReplyKeyDown(e) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    sendReply();
  }

  async function sendMedia(file) {
    if (!replyStaffId) {
      setError("Pick who you're replying as before attaching a file.");
      return;
    }
    setUploadingFile(true);
    setError(null);
    try {
      const { url, contentType, name } = await uploadClientMessageMedia(id, file);
      await postReply({
        body: replyDraft.trim(),
        media_url: url,
        media_type: contentType.startsWith('image/') ? 'image' : 'file',
        media_name: name,
      });
    } catch (err) {
      setError(err.message);
    }
    setUploadingFile(false);
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) sendMedia(file);
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div className="messages-thread-page">
      <div className="page-header">
        <button type="button" className="button-link" onClick={() => router.push('/messages')}>
          ← Messages
        </button>
        <h1>
          <a href={`/clients/${id}`}>
            {client?.full_name}
            {client?.client_number ? ` (Client #${client.client_number})` : ''}
          </a>
        </h1>
        {/* Opening this thread already cleared its alarm automatically —
            this is the explicit override for "no, keep this flagged" (or
            to re-flag something already read/replied to as still needing
            follow-up). Independent of read status either way. */}
        <button type="button" onClick={toggleFlagged} className={flagged ? 'button-link' : ''} title={flagged ? 'Clear the needs-attention flag' : 'Flag this conversation as still needing attention'}>
          {flagged ? '🔔 Flagged' : '🏳️ Flag as needing attention'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="portal-chat-thread staff-chat-thread" ref={threadRef}>
        {messages.length === 0 && <p className="visit-meta">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`portal-chat-bubble portal-chat-bubble-${m.sender === 'client' ? 'theirs' : 'mine'}`}>
            {m.media_url && m.media_type === 'file' ? (
              <a href={m.media_url} target="_blank" rel="noopener noreferrer">
                📎 Download file
              </a>
            ) : (
              m.media_url && (
                <a href={m.media_url} target="_blank" rel="noopener noreferrer">
                  <img src={m.media_url} alt="" className="portal-chat-bubble-image" />
                </a>
              )
            )}
            {m.body && <p>{m.body}</p>}
            <span className="portal-chat-bubble-meta">
              {m.sender === 'staff' ? m.staff?.full_name || 'Staff' : m.sender === 'ai' ? '🤖 AI concierge' : client?.full_name || 'Client'} ·{' '}
              {formatDateTime(m.created_at)} · {m.channel === 'whatsapp' ? '💬 WhatsApp' : '📱 App'}
              {/* Delivery status only applies to our own outbound WhatsApp
                  sends — Meta's send API can accept a message and only
                  report async, moments later, that it actually never
                  reached the client (most often: sent outside the 24-hour
                  window their own message opens) — this is the only place
                  that ever surfaces, so a 'failed' send needs to stand out. */}
              {m.channel === 'whatsapp' && m.sender !== 'client' && m.status && (
                <span className={m.status === 'failed' ? 'portal-chat-bubble-failed' : ''}>
                  {' '}
                  ·{' '}
                  {m.status === 'failed'
                    ? `⚠️ Not delivered${m.wa_error ? ` (${m.wa_error})` : ''}`
                    : m.status === 'read'
                      ? '✓✓ Read'
                      : m.status === 'delivered'
                        ? '✓✓ Delivered'
                        : '✓ Sent'}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* .hospitalization-chat's descendant rules just widen the reply
          form's select/textarea sizing — reused here via the same
          wrapper class rather than duplicating that CSS. */}
      <div className="hospitalization-chat">
        {/* Explicit channel pick, reusing the vaccinations page's pill-
            toggle look (.window-filter) — currentChannel() would otherwise
            guess silently, which is exactly what left a brand-new thread
            stuck on "App" with no way to switch it to WhatsApp. */}
        <div className="window-filter">
          <button
            type="button"
            className={currentChannel() === 'app' ? 'window-filter-active' : ''}
            onClick={() => setChannelOverride('app')}
          >
            📱 App
          </button>
          <button
            type="button"
            className={currentChannel() === 'whatsapp' ? 'window-filter-active' : ''}
            onClick={() => setChannelOverride('whatsapp')}
          >
            💬 WhatsApp
          </button>
        </div>
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
            placeholder="Reply... (Enter to send, Shift+Enter for a new line)"
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            onKeyDown={handleReplyKeyDown}
          />
          <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploadingFile}>
            📷
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}>
            📎
          </button>
          <button type="submit" disabled={sendingReply || uploadingFile || !replyDraft.trim() || !replyStaffId}>
            {sendingReply ? 'Sending...' : uploadingFile ? 'Uploading...' : 'Send'}
          </button>
        </form>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          hidden
        />
        <input ref={fileInputRef} type="file" onChange={handleFileChange} hidden />
      </div>
    </div>
  );
}
