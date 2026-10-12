// lib/sendPaymentMessageClient.js
// Browser side of the payment-link / reminder buttons: asks the server to
// send from the clinic's WhatsApp Business number (POST
// /api/payment-messages). Only if the clinic message isn't usable yet
// (Meta approval pending) does it fall back to opening WhatsApp on this
// device with the old pre-filled text, as before.
// Returns a short status line for the page to show.

import { openWhatsApp } from '@/lib/whatsapp';

// One send at a time per invoice / client: a second tap while the first is
// still on its way does nothing (the server also refuses an identical
// message within 2 minutes).
const inFlight = new Set();

export async function sendPaymentMessage({ invoiceId, clientId, kind = 'link', phone, fallbackMessage }) {
  const key = `${kind}:${invoiceId || clientId}`;
  if (inFlight.has(key)) return { ok: false, note: 'Already sending…' };
  inFlight.add(key);
  try {
    return await send({ invoiceId, clientId, kind, phone, fallbackMessage, scope: null });
  } finally {
    inFlight.delete(key);
  }
}

async function send({ invoiceId, clientId, kind, phone, fallbackMessage, scope }) {
  const res = await fetch('/api/payment-messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice_id: invoiceId || undefined, client_id: clientId || undefined, kind, scope: scope || undefined }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.choose) {
    // The client has other open invoices: one link for everything, or
    // just this one?
    const others = data.others.map((o) => `${o.label} (${o.due})`).join(', ');
    const everything = window.confirm(
      `${data.clientName || 'This client'} also has ${others} open.\n\n` +
        `OK: send ONE link for everything (${data.allDue}).\n` +
        `Cancel: send a link for ${data.thisInvoice.label} only (${data.thisInvoice.due}).`
    );
    return send({ invoiceId, clientId, kind, phone, fallbackMessage, scope: everything ? 'all' : 'one' });
  }
  if (res.ok && data.alreadySent) return { ok: true, note: '✅ Already sent a moment ago, not sent again' };
  if (res.ok) return { ok: true, note: `✅ Sent from the clinic WhatsApp${data.total ? ` (${data.total})` : ''}` };
  if (data.fallback && fallbackMessage && openWhatsApp(phone, fallbackMessage)) {
    return { ok: true, note: 'Opened in your WhatsApp (the clinic number message is waiting for Meta approval).' };
  }
  return { ok: false, note: data.error || 'Could not send.' };
}
