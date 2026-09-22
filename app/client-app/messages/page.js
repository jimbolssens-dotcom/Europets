// app/client-app/messages/page.js
// The client's side of the general client<->staff chat (see
// client_messages / migration 120) — one ongoing thread with the clinic,
// not tied to a specific pet or admission. Sends via the public-shaped
// POST /api/clients/:id/request-message, reads/receives via GET+realtime
// on /api/clients/:id/messages — same split and same chat bubble markup as
// the existing hospitalization portal chat (app/portal/hospitalization/
// [id]), just scoped to the whole client instead of one admission.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClientAppSession } from '@/app/_components/useClientAppSession';
import { supabase } from '@/lib/supabaseClient';
import { formatDateTime } from '@/lib/formatTimestamp';
import { isWithinOfficeHours, OFFICE_HOURS_LABEL } from '@/lib/officeHours';

export default function ClientAppMessagesPage() {
  const { clientId, ready } = useClientAppSession();
  const router = useRouter();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const threadRef = useRef(null);

  useEffect(() => {
    if (ready && !clientId) router.replace('/client-app');
  }, [ready, clientId, router]);

  useEffect(() => {
    if (!ready || !clientId) return;

    const loadMessages = () =>
      fetch(`/api/clients/${clientId}/messages`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          setMessages(Array.isArray(data) ? data : []);
          setLoading(false);
        });

    loadMessages();

    const channel = supabase
      .channel(`client-app-messages-${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'client_messages', filter: `client_id=eq.${clientId}` },
        loadMessages
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [ready, clientId]);

  // Also depends on `loading`: the page renders nothing (see the `if
  // (!ready || loading) return null` below) until it flips to false, so
  // this ref doesn't exist yet on the render where messages was actually
  // set — without loading in the deps, the one render where the ref first
  // becomes non-null wouldn't rerun this effect, and the thread would
  // silently open scrolled to the top instead of the latest message.
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function sendMessage(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/clients/${clientId}/request-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    setSending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to send — please try again.');
      return;
    }
    setDraft('');
    // Don't wait on realtime for the sent message to show up — mirrors the
    // hospitalization portal chat, which also reloads right after sending.
    fetch(`/api/clients/${clientId}/messages`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setMessages(Array.isArray(data) ? data : []));
  }

  if (!ready || loading) return null;

  return (
    <div className="mobile-page">
      <h1>Messages</h1>
      <p className="mobile-subtitle">Chat directly with the Europets Clinic team.</p>

      <div className="portal-chat-thread" ref={threadRef}>
        {messages.length === 0 && <p className="mobile-subtitle">No messages yet — say hello!</p>}
        {messages.map((m) => (
          <div key={m.id} className={`portal-chat-bubble portal-chat-bubble-${m.sender === 'client' ? 'mine' : 'theirs'}`}>
            <p>{m.body}</p>
            <span className="portal-chat-bubble-meta">
              {m.sender === 'client' ? 'You' : m.staff?.full_name || 'Europets Clinic'} · {formatDateTime(m.created_at)}
            </span>
          </div>
        ))}
      </div>

      {error && <p className="client-app-login-error">{error}</p>}

      <form className="portal-chat-form" onSubmit={sendMessage}>
        <textarea
          rows={2}
          placeholder="Type a message..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={sending || !draft.trim()}>
          {sending ? 'Sending...' : 'Send'}
        </button>
      </form>

      {!isWithinOfficeHours(new Date()) && (
        <p className="mobile-subtitle">
          You&apos;ve reached us outside office hours ({OFFICE_HOURS_LABEL}) — we&apos;ll reply once we&apos;re back
          in the office.
        </p>
      )}
    </div>
  );
}
