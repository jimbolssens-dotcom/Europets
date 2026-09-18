// app/messages/[id]/page.jsx
// One client's general chat thread — the staff side of the client app's
// "Messages" feature (see client_messages / migration 120). Same chat
// bubble markup/CSS and "Replying as..." staff-picker convention as the
// hospitalization chat on app/(admin)/hospitalization/[id]/page.jsx, just
// standing on its own page instead of a collapsible panel, and scoped to a
// client instead of one admission.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { formatDateTime } from '@/lib/formatTimestamp';

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
  const [error, setError] = useState(null);
  const threadRef = useRef(null);

  useEffect(() => {
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

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  async function sendReply(e) {
    e.preventDefault();
    const text = replyDraft.trim();
    if (!text || !replyStaffId) return;
    setSendingReply(true);
    setError(null);
    const res = await fetch(`/api/clients/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text, staff_id: replyStaffId }),
    });
    setSendingReply(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to send');
      return;
    }
    setReplyDraft('');
    // Don't wait on realtime for the reply to show up — same as the
    // hospitalization chat's sendReply, which also reloads immediately
    // rather than relying solely on the postgres_changes subscription.
    fetch(`/api/clients/${id}/messages`)
      .then((r) => r.json())
      .then((data) => setMessages(Array.isArray(data) ? data : []));
  }

  if (loading) return <p>Loading...</p>;

  return (
    <>
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
      </div>

      {error && <p className="error">{error}</p>}

      <div className="portal-chat-thread staff-chat-thread" ref={threadRef}>
        {messages.length === 0 && <p className="visit-meta">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`portal-chat-bubble portal-chat-bubble-${m.sender === 'staff' ? 'mine' : 'theirs'}`}>
            <p>{m.body}</p>
            <span className="portal-chat-bubble-meta">
              {m.sender === 'staff' ? m.staff?.full_name || 'Staff' : client?.full_name || 'Client'} ·{' '}
              {formatDateTime(m.created_at)}
            </span>
          </div>
        ))}
      </div>

      {/* .hospitalization-chat's descendant rules just widen the reply
          form's select/textarea sizing — reused here via the same
          wrapper class rather than duplicating that CSS. */}
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
          <button type="submit" disabled={sendingReply || !replyDraft.trim() || !replyStaffId}>
            {sendingReply ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>
    </>
  );
}
