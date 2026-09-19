// app/messages/page.jsx
// Staff inbox for the client app's general chat (see client_messages /
// migration 120) — one row per client conversation, newest first, exactly
// like the day-procedures/hospitalization lists' table-of-records pattern.
// A client waiting on a reply (their last message hasn't been answered)
// gets the same amber "needs attention" row highlight as a cage/nav link
// elsewhere in the app (.cage-update-requested) — see app/(admin)/layout.js
// for the matching nav badge + alert chime.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

function formatWhen(iso) {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function preview(text) {
  if (!text) return '';
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

export default function MessagesInboxPage() {
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
      .channel('messages-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_messages' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Messages</h1>
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : conversations.length === 0 ? (
        <p>No conversations yet — messages clients send from the client app will show up here.</p>
      ) : (
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
            {conversations.map((c) => (
              <tr key={c.client_id} className={c.pending ? 'cage-update-requested' : ''}>
                <td>{c.pending && '🔔'}</td>
                <td>
                  <a href={`/clients/${c.client_id}`}>
                    {c.client?.full_name}
                    {c.client?.client_number ? ` (Client #${c.client.client_number})` : ''}
                  </a>
                </td>
                <td>
                  {c.last_sender === 'staff' ? 'You: ' : ''}
                  {preview(c.last_message)}
                </td>
                <td>{formatWhen(c.last_message_at)}</td>
                <td>
                  <a href={`/messages/${c.client_id}`}>Open</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
