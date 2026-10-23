// app/mobile/messages/[id]/page.js
// Mobile Messenger thread — one client's conversation (App + WhatsApp
// folded together, same as desktop's /messages/[id]), or an unmatched
// WhatsApp number's own thread if no client is linked yet. `id` is either
// a client's uuid or a raw phone number — told apart below by shape, same
// distinction the desktop inbox makes via thread_key. Fills the screen
// (see MobileBodyFillToggle.jsx / .mobile-body-fill in globals.css) so the
// message list is what scrolls, with the reply bar fixed at the bottom —
// maximizing space for actually reading the conversation was the whole
// point of building this, not a fixed-height box like the desktop version
// sits in.
//
// No custom emoji picker — every iOS/Android keyboard already has its own
// emoji key built in the moment this textarea is focused, so building a
// second one here would just be a worse, redundant version of something
// already on the device.
//
// Staff identity comes from useMobileStaff (whoever picked their name on
// the phone) instead of a "Replying as..." dropdown like desktop — one
// less tap on a phone, and this app never has more than one person
// actively using it at a time anyway.

'use client';

import DictateButton from '@/app/_components/DictateButton';
import ShareToTeamButton from '@/app/_components/ShareToTeamButton';
import { messageAssignees, assigneeLabel } from '@/lib/messageAssignees';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useMobileStaff } from '@/app/_components/useMobileStaff';
import { formatDateTime } from '@/lib/formatTimestamp';
import { uploadClientMessageMedia } from '@/lib/attachments';
import FileToRecordButton from '@/app/_components/FileToRecordButton';
import { readViewCacheEntry, writeViewCacheEntry } from '@/lib/viewCache';

// The thread as it last loaded on this phone, painted at once on the next
// visit while the fresh copy loads (lib/viewCache.js; last 20 threads).
const THREAD_CACHE_PREFIX = 'europets-mobile-thread-v1';
const THREAD_CACHE_MESSAGES = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function MobileMessageThreadPage() {
  const { id: rawId } = useParams();
  const router = useRouter();
  const id = decodeURIComponent(rawId);
  const isMatched = UUID_RE.test(id);
  const { staffId, me, ready: staffReady } = useMobileStaff();

  const [client, setClient] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [channelOverride, setChannelOverride] = useState(null); // matched threads only
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [assignedStaffId, setAssignedStaffId] = useState('');
  const [flagged, setFlagged] = useState(false);
  const [escalationReason, setEscalationReason] = useState(null); // why the AI handed this over (migration 186)
  const [aiAnswering, setAiAnswering] = useState(false);
  // When staff handed this conversation to the AI (migration 197).
  const [aiTakeoverAt, setAiTakeoverAt] = useState(null);
  const threadRef = useRef(null);
  const composerRef = useRef(null);
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const apiBase = isMatched ? `/api/clients/${id}/messages` : `/api/client-messages/unmatched/${encodeURIComponent(id)}`;

  useEffect(() => {
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => setStaffList(Array.isArray(data) ? data : []));
  }, []);

  // Hands this conversation to one doctor/nurse — pushes a one-time
  // notification to their own phone if they've turned notifications on
  // (see StaffPushOptIn.jsx).
  async function assignTo(staffId) {
    setAssignedStaffId(staffId);
    await fetch('/api/client-messages/thread-state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_key: isMatched ? id : `phone:${id}`, assigned_staff_id: staffId || null }),
    });
  }

  // Same needs-attention flag as the desktop thread page's "Flag as
  // needing attention" button (thread_state.flagged) — a tiny on/off flag
  // icon here instead of a full-width button.
  async function toggleFlagged() {
    const next = !flagged;
    setFlagged(next);
    await fetch('/api/client-messages/thread-state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_key: isMatched ? id : `phone:${id}`, flagged: next }),
    });
  }

  useLayoutEffect(() => {
    const cached = readViewCacheEntry(THREAD_CACHE_PREFIX, id);
    if (!cached || !Array.isArray(cached.messages)) return;
    setClient(cached.client || null);
    setMessages(cached.messages);
    setAssignedStaffId(cached.assignedStaffId || '');
    setFlagged(Boolean(cached.flagged));
    setEscalationReason(cached.escalationReason || null);
    setAiTakeoverAt(cached.aiTakeoverAt || null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    setChannelOverride(null);
    let cancelled = false;
    const loadMessages = () =>
      fetch(apiBase, { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && Array.isArray(data)) setMessages(data);
        })
        .catch(() => {});

    const promises = [loadMessages()];
    if (isMatched) {
      promises.push(fetch(`/api/clients/${id}`).then((res) => (res.ok ? res.json() : null)).catch(() => null));
    }
    Promise.all(promises).then(([, clientData]) => {
      if (cancelled) return;
      if (isMatched) setClient(clientData);
      setLoading(false);
    });

    // Opening this thread clears its 🔔 alarm, same as the desktop page —
    // unmatched threads are keyed by phone:<number>, matched by client_id.
    fetch('/api/client-messages/thread-state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_key: isMatched ? id : `phone:${id}`, mark_read: true }),
    });
    fetch(`/api/client-messages/thread-state?thread_key=${encodeURIComponent(isMatched ? id : `phone:${id}`)}`)
      .then((res) => res.json())
      .then((data) => {
        setAssignedStaffId(data?.assigned_staff_id || '');
        setFlagged(Boolean(data?.flagged));
        setEscalationReason(data?.flagged ? data?.escalation_reason || null : null);
        setAiTakeoverAt(data?.ai_takeover_at || null);
      });

    const channel = supabase
      .channel(`mobile-messages-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_messages',
          filter: isMatched ? `client_id=eq.${id}` : `phone=eq.${id}`,
        },
        loadMessages
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Keep this phone's copy of the thread up to date for the next visit.
  useEffect(() => {
    if (loading || (isMatched && !client)) return;
    writeViewCacheEntry(THREAD_CACHE_PREFIX, id, {
      client,
      messages: messages.slice(-THREAD_CACHE_MESSAGES),
      assignedStaffId,
      flagged,
      escalationReason,
      aiTakeoverAt,
    });
  }, [id, isMatched, loading, client, messages, assignedStaffId, flagged, escalationReason, aiTakeoverAt]);

  // The composer is pinned over the bottom of the thread (position: fixed,
  // see .mobile-messages-composer), so the thread needs bottom padding at
  // least as tall as the composer actually renders — a fixed guess wasn't
  // enough on narrow screens (e.g. a Galaxy Z Fold's cover screen) where
  // the composer wraps taller and hid the newest message behind it.
  // Measured live, so it also tracks the textarea growing as staff type.
  useEffect(() => {
    const composer = composerRef.current;
    const thread = threadRef.current;
    if (!composer || !thread || typeof ResizeObserver === 'undefined') return undefined;
    const apply = () => {
      const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
      thread.style.paddingBottom = `${composer.offsetHeight + 16}px`;
      if (nearBottom) thread.scrollTop = thread.scrollHeight;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(composer);
    return () => observer.disconnect();
  }, [loading, staffReady]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, loading]);

  // Same "stay on whichever channel the conversation is already on"
  // default as desktop — only meaningful for a matched client, since an
  // unmatched thread is WhatsApp by definition (no client-app account to
  // reach any other way yet).
  const clientAppLastSeenAt = client?.client_app_last_seen_at;
  const usesClientApp =
    !!clientAppLastSeenAt && Date.now() - new Date(clientAppLastSeenAt).getTime() < 60 * 24 * 60 * 60 * 1000;

  function currentChannel() {
    if (!isMatched) return 'whatsapp';
    if (channelOverride) return channelOverride;
    if (messages.length > 0) return messages[messages.length - 1]?.channel === 'whatsapp' ? 'whatsapp' : 'app';
    return usesClientApp ? 'app' : 'whatsapp';
  }

  async function postReply(extra) {
    const payload = isMatched
      ? { staff_id: staffId, channel: currentChannel(), ...extra }
      : { staff_id: staffId, ...extra };
    const res = await fetch(apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to send');
      return false;
    }
    setDraft('');
    fetch(apiBase, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setMessages(Array.isArray(data) ? data : []));
    return true;
  }

  // Clears a failed send out of the thread — matched (client-linked)
  // threads only, since the DELETE route needs a client id. Server-side
  // scoped to status='failed' only (see DELETE /api/clients/:id/messages),
  // so this can never touch a real sent/delivered/read message.
  async function deleteFailedMessage(messageId) {
    if (!confirm('Remove this failed message from the thread? It was never delivered — this just clears it from the record.')) return;
    setDeletingId(messageId);
    setError(null);
    const res = await fetch(`/api/clients/${id}/messages?message_id=${messageId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to remove');
    }
    setDeletingId(null);
  }

  async function sendReply(e) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || !staffId) return;
    setSending(true);
    setError(null);
    await postReply({ body: text });
    setSending(false);
  }

  async function sendMedia(file) {
    if (!isMatched) return; // the unmatched route has no media support yet
    if (!staffId) {
      setError('Pick who you are on the mobile home page first.');
      return;
    }
    setUploadingFile(true);
    setError(null);
    try {
      const { url, contentType, name } = await uploadClientMessageMedia(id, file);
      await postReply({
        body: draft.trim(),
        media_url: url,
        media_type: contentType.startsWith('image/') ? 'image' : contentType.startsWith('video/') ? 'video' : 'file',
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

  const headerName = isMatched
    ? `${client?.full_name || 'Loading...'}${client?.client_number ? ` (#${client.client_number})` : ''}`
    : `${id} (unmatched)`;

  // Same as the desktop thread's "AI answer" (POST /api/whatsapp/concierge-answer).
  async function askAiToAnswer() {
    if (!confirm('Hand this conversation to the AI? If the client is waiting it answers now; otherwise it takes over from their next message. Writing a message yourself takes it back.')) return;
    setAiAnswering(true);
    setError(null);
    const res = await fetch('/api/whatsapp/concierge-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: id }),
    });
    const data = await res.json().catch(() => ({}));
    setAiAnswering(false);
    if (!res.ok) return setError(data.error || 'The AI could not answer.');
    if (data.takeover) {
      setAiTakeoverAt(new Date().toISOString());
      setFlagged(false);
      setEscalationReason(null);
    } else {
      setFlagged(true);
      setEscalationReason(data.reason);
    }
  }

  if (loading || !staffReady) return <p className="mobile-loading">Loading...</p>;

  // The AI is in charge until a member of staff writes after the takeover.
  const aiHandling = Boolean(aiTakeoverAt) && !messages.some((m) => m.sender === 'staff' && new Date(m.created_at) > new Date(aiTakeoverAt));

  // The AI's reason for handing the thread over (migration 186) shows
  // under the client message it didn't answer.
  const lastClientMessageId = [...messages].reverse().find((m) => m.sender === 'client')?.id;

  return (
    <div className="mobile-messages-thread-page">
      <div className="mobile-messages-header">
        <button type="button" className="mobile-link-btn" onClick={() => router.push('/mobile/messages')}>
          ← Back
        </button>
        {/* Tapping the name / client number opens the client's file. */}
        {isMatched ? (
          <a className="mobile-messages-header-name mobile-messages-header-link" href={`/clients/${id}`} title="Open the client file">
            {headerName}
          </a>
        ) : (
          <span className="mobile-messages-header-name">{headerName}</span>
        )}
        <button
          type="button"
          onClick={toggleFlagged}
          className={`mobile-messages-flag ${flagged ? 'on' : ''}`}
          aria-pressed={flagged}
          aria-label={flagged ? 'Clear the needs-attention flag' : 'Flag as needing attention'}
          title={flagged ? 'Clear the needs-attention flag' : 'Flag as needing attention'}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M5 21V4m0 0h11l-2 4 2 4H5" fill={flagged ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </button>
        {isMatched && messages.some((m) => m.channel === 'whatsapp' && m.sender === 'client') && (
          <button
            type="button"
            onClick={askAiToAnswer}
            disabled={aiAnswering || aiHandling}
            className={`mobile-messages-flag${aiHandling ? ' on' : ''}`}
            aria-label={aiHandling ? 'The AI is handling this conversation' : 'Hand this conversation to the AI'}
            title={aiHandling ? 'The AI is handling this conversation. Writing a message yourself takes it back.' : 'Hand this conversation to the AI'}
          >
            {aiAnswering ? '…' : aiHandling ? '🤖✓' : '🤖'}
          </button>
        )}
        <select
          value={assignedStaffId}
          onChange={(e) => assignTo(e.target.value)}
          className={`mobile-messages-assign ${assignedStaffId ? 'on' : ''}`}
          title="Assign this conversation to one doctor or nurse, or to finance for bills and payments"
          aria-label="Assign to"
        >
          <option value="">👤 Assign</option>
          {messageAssignees(staffList).map((s) => (
            <option key={s.id} value={s.id}>
              {assigneeLabel(s)}
            </option>
          ))}
        </select>
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
            ) : m.media_url && m.media_type === 'audio' ? (
              <>
                <audio controls src={m.media_url} className="portal-chat-bubble-audio" />
                {m.transcript && <p className="voice-note-transcript">🎤 {m.transcript}</p>}
              </>
            ) : m.media_url && m.media_type === 'video' ? (
              <video controls playsInline preload="metadata" src={m.media_url} className="portal-chat-bubble-video" />
            ) : (
              m.media_url && (
                <a href={m.media_url} target="_blank" rel="noopener noreferrer">
                  <img src={m.media_url} alt="" className="portal-chat-bubble-image" />
                </a>
              )
            )}
            {m.sender === 'client' && m.media_url && m.media_type !== 'audio' && (
              <FileToRecordButton messageId={m.id} staffId={staffId} />
            )}
            {m.body && <p>{m.body}</p>}
            {m.sender === 'client' && (
              <ShareToTeamButton message={m} clientId={client?.id} clientName={client?.full_name} staffId={staffId} staff={staffList} />
            )}
            {escalationReason && m.id === lastClientMessageId && (
              <span className="thread-escalation-note">🤖 Handed to staff: {escalationReason}</span>
            )}
            <span className="portal-chat-bubble-meta">
              {m.sender === 'staff'
                ? m.staff?.full_name || 'Staff'
                : m.sender === 'ai'
                  ? m.is_notice ? '🤖 Automatic notice' : '🤖 AI concierge'
                  : m.sender === 'system'
                    ? '🔔 Automated'
                    : headerName}{' '}
              ·{' '}
              {formatDateTime(m.created_at)}
              {isMatched && ` · ${m.channel === 'whatsapp' ? '💬 WhatsApp' : m.channel === 'email' ? '✉️ Email' : '📱 App'}`}
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
                  {m.status === 'failed' && isMatched && (
                    <>
                      {' '}
                      ·{' '}
                      <button
                        type="button"
                        className="portal-chat-bubble-remove"
                        onClick={() => deleteFailedMessage(m.id)}
                        disabled={deletingId === m.id}
                      >
                        {deletingId === m.id ? 'Removing…' : 'Remove'}
                      </button>
                    </>
                  )}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="mobile-messages-composer" ref={composerRef}>
        {isMatched && (
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
        )}
        <form className="portal-chat-form" onSubmit={sendReply}>
          {isMatched && (
            <>
              <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploadingFile}>
                📷
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}>
                📎
              </button>
            </>
          )}
          <textarea
            rows={1}
            placeholder={me ? `Message as ${me.full_name.split(' ')[0]}...` : 'Message...'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          {isMatched && <DictateButton clientId={client?.id} current={draft} onDraft={setDraft} disabled={sending} />}
          <button type="submit" disabled={sending || uploadingFile || !draft.trim() || !staffId}>
            {sending ? '…' : uploadingFile ? '…' : 'Send'}
          </button>
        </form>
        {isMatched && (
          <>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} hidden />
            <input ref={fileInputRef} type="file" onChange={handleFileChange} hidden />
          </>
        )}
      </div>
    </div>
  );
}
