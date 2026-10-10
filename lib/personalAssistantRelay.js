// lib/personalAssistantRelay.js
// The clinic's WhatsApp number doubles as the owner's private assistant
// number. Messages FROM the owner's own phone(s) are handed to the separate
// personal-assistant app and never stored, shown or answered here — the
// webhook checks this before anything touches client_messages, storage or
// the AI concierge.
//
// Config (Vercel env, never in code — this repo is public):
//   ASSISTANT_OWNER_PHONES  digits, comma separated (e.g. both phones)
//   ASSISTANT_INBOX_URL     https://<assistant>.vercel.app/api/inbox/whatsapp
//   ASSISTANT_INBOX_SECRET  shared secret, same value set in the assistant app
// All unset = feature off, the webhook behaves exactly as before.

import { createHmac } from 'crypto';

function ownerPhones() {
  return (process.env.ASSISTANT_OWNER_PHONES || '')
    .split(',')
    .map((p) => p.replace(/\D/g, ''))
    .filter(Boolean);
}

export function isAssistantOwnerPhone(digits) {
  return Boolean(digits) && Boolean(process.env.ASSISTANT_INBOX_URL) && ownerPhones().includes(digits);
}

// Best-effort and quick: the assistant acks immediately and does its work in
// the background, so this never holds up the 200 Meta is waiting for. A
// failure is logged without the message content.
export async function relayToAssistant(message, digits) {
  const body = JSON.stringify({ from: digits, message });
  const signature = `sha256=${createHmac('sha256', process.env.ASSISTANT_INBOX_SECRET || '').update(body).digest('hex')}`;
  try {
    const res = await fetch(process.env.ASSISTANT_INBOX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-assistant-signature': signature },
      body,
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) console.error('Assistant relay rejected', res.status, message.id);
  } catch (err) {
    console.error('Assistant relay failed', message.id, err?.name || 'error');
  }
}
