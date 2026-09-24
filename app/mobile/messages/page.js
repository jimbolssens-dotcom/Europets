// app/mobile/messages/page.js
// Mobile Messenger inbox — same data as the desktop /messages page (GET
// /api/client-messages: the client app's own chat and WhatsApp folded
// into one list, newest thread first), laid out as a tappable list
// instead of a table. Tapping a row opens app/mobile/messages/[id] — a
// client's own uuid for a matched conversation, or the raw phone number
// for a WhatsApp thread with no client on file yet (see that page for how
// it tells the two apart).

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import MobileHomeButton from '@/app/_components/MobileHomeButton';

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
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

export default function MobileMessagesListPage() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch('/api/client-messages')
        .then((res) => res.json())
        .then((data) => {
          setConversations(Array.isArray(data) ? data : []);
          setLoading(false);
        });

    load();
    const channel = supabase
      .channel('mobile-messages-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_messages' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_message_thread_state' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  return (
    <div className="mobile-page">
      <MobileHomeButton />
      <h1>Messages</h1>

      {loading ? (
        <p>Loading...</p>
      ) : conversations.length === 0 ? (
        <p>No conversations yet.</p>
      ) : (
        <ul className="mobile-list">
          {conversations.map((c) => {
            const href = c.client_id ? `/mobile/messages/${c.client_id}` : `/mobile/messages/${encodeURIComponent(c.phone)}`;
            const name = c.client?.full_name || c.phone;
            return (
              <li key={c.thread_key}>
                <a href={href} className={`mobile-list-item${c.pending ? ' mobile-messages-row-pending' : ''}`}>
                  <span className="mobile-list-title">
                    {c.pending && '🔔 '}
                    {name}
                    {!c.client_id && <span className="mobile-list-meta"> · unmatched</span>}
                  </span>
                  <span className="mobile-list-meta">
                    {c.last_sender === 'staff' ? 'You: ' : c.last_sender === 'ai' ? '🤖 ' : ''}
                    {preview(c.last_message)} · {formatWhen(c.last_message_at)}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
