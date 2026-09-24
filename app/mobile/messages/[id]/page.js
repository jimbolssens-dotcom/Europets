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

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useMobileStaff } from '@/app/_components/useMobileStaff';
import { formatDateTime } from '@/lib/formatTimestamp';
import { uploadClientMessageMedia } from '@/lib/attachments';

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
  const threadRef = useRef(null);
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const apiBase = isMatched ? `/api/clients/${id}/messages` : `/api/client-messages/unmatched/${encodeURIComponent(id)}`;

  useEffect(() => {
    setChannelOverride(null);
    const loadMessages = () =>
      fetch(apiBase, { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => setMessages(Array.isArray(data) ? data : []));

    const promises = [loadMessages()];
    if (isMatched) {
      promises.push(fetch(`/api/clients/${id}`).then((res) => (res.ok ? res.json() : null)));
    }
    Promise.all(promises).then(([, clientData]) => {
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
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  const headerName = isMatched
    ? `${client?.full_name || 'Loading...'}${client?.client_number ? ` (#${client.client_number})` : ''}`
    : `${id} (unmatched)`;

  if (loading || !staffReady) return <p className="mobile-loading">Loading...</p>;

  return (
    <div className="mobile-messages-thread-page">
      <div className="mobile-messages-header">
        <button type="button" className="mobile-link-btn" onClick={() => router.push('/mobile/messages')}>
          ← Back
        </button>
        <span className="mobile-messages-header-name">{headerName}</span>
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
              {m.sender === 'staff' ? m.staff?.full_name || 'Staff' : m.sender === 'ai' ? '🤖 AI concierge' : headerName} ·{' '}
              {formatDateTime(m.created_at)}
              {isMatched && ` · ${m.channel === 'whatsapp' ? '💬 WhatsApp' : '📱 App'}`}
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

      <div className="mobile-messages-composer">
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
