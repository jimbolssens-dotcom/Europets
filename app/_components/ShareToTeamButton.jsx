// app/_components/ShareToTeamButton.jsx
// "👥 Share to team" on a client's message in their chat
// (app/(admin)/messages/[id], app/mobile/messages/[id]): posts it into a
// team chat group (migration 219, lib/teamChat.js) as a card, with an
// optional note and @mention, so whoever picks it up can reply to the
// client from there (from the clinic WhatsApp number).

'use client';

import { useState } from 'react';

const GROUPS = [
  ['everyone', 'Everyone'],
  ['vets', 'Medical'],
  ['reception', 'Reception'],
  ['finance', 'Finance'],
];

export default function ShareToTeamButton({ message, clientId, clientName, staffId, staff = [] }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState('everyone');
  const [mention, setMention] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState(null); // 'sending' | 'done' | error text

  if (!clientId) return null;

  async function share() {
    // Whoever is picked in the chat's "Sent by", else who this device last was.
    let sender = staffId;
    try {
      sender = sender || localStorage.getItem('team_staff_id') || localStorage.getItem('europets_mobile_staff_id') || localStorage.getItem('pay_link_staff_id') || '';
    } catch {}
    if (!sender) return setState('Pick who you are (the "Sent by" list) first.');
    setState('sending');
    const who = staff.find((s) => s.id === mention);
    const body = [who ? `@${who.full_name}` : '', note.trim()].filter(Boolean).join(' ');
    const quote = message.body || (message.media_type === 'image' ? '📷 Photo' : message.media_type === 'audio' ? '🎤 Voice note' : message.media_url ? '📎 File' : '');
    const res = await fetch(`/api/team/${group}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staff_id: sender,
        body,
        mentions: who ? [who.id] : [],
        ref: { kind: 'client_message', client_id: clientId, client_name: clientName, message_id: message.id, quote },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setState(data.error || 'Could not share it.');
    setState('done');
    setTimeout(() => {
      setOpen(false);
      setState(null);
      setNote('');
      setMention('');
    }, 1500);
  }

  if (!open)
    return (
      <button type="button" className="share-team-btn" onClick={() => setOpen(true)} title="Share this message with the team">
        👥 Share to team
      </button>
    );

  return (
    <div className="share-team">
      <div className="share-team-row">
        {GROUPS.map(([key, name]) => (
          <button key={key} type="button" className={`team-group${group === key ? ' team-group-on' : ''}`} onClick={() => setGroup(key)}>
            {name}
          </button>
        ))}
      </div>
      <div className="share-team-row">
        <select value={mention} onChange={(e) => setMention(e.target.value)} aria-label="Mention someone">
          <option value="">@ nobody</option>
          {staff
            .filter((s) => s.active !== false && s.id !== staffId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                @{s.full_name}
              </option>
            ))}
        </select>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" aria-label="Note" />
      </div>
      <div className="share-team-row">
        <button type="button" onClick={share} disabled={state === 'sending' || state === 'done'}>
          {state === 'sending' ? 'Sharing...' : state === 'done' ? '✓ Shared' : 'Share'}
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {state && !['sending', 'done'].includes(state) && <p className="error">{state}</p>}
    </div>
  );
}
