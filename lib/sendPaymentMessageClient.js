// lib/sendPaymentMessageClient.js
// Browser side of the payment-link / reminder buttons: asks the server to
// send from the clinic's WhatsApp Business number (POST
// /api/payment-messages). Only if the clinic message isn't usable yet
// (Meta approval pending) does it fall back to opening WhatsApp on this
// device with the old pre-filled text, as before.
// Returns a short status line for the page to show.

import { openWhatsApp } from '@/lib/whatsapp';

export async function sendPaymentMessage({ invoiceId, clientId, kind = 'link', phone, fallbackMessage }) {
  const res = await fetch('/api/payment-messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice_id: invoiceId || undefined, client_id: clientId || undefined, kind }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, note: '✅ Sent from the clinic WhatsApp' };
  if (data.fallback && fallbackMessage && openWhatsApp(phone, fallbackMessage)) {
    return { ok: true, note: 'Opened in your WhatsApp (the clinic number message is waiting for Meta approval).' };
  }
  return { ok: false, note: data.error || 'Could not send.' };
}
