// lib/metaWhatsapp.js
// Sends the client-app login code over WhatsApp via Meta's own WhatsApp
// Business Platform (Cloud API) — no Twilio or other middleman. See
// app/api/client-app/auth/request-code/route.js for the caller.
//
// A business-initiated WhatsApp message to someone who hasn't messaged
// the clinic first has to use a pre-approved message template (Meta's
// "Authentication" category is fast-tracked for exactly this — a numeric
// code with a copy-code button). Create that template once in Meta's
// WhatsApp Manager, then set META_WHATSAPP_OTP_TEMPLATE_NAME to its name
// (defaults to "otp_login") — this always sends via template, never a
// free-form text message, since free-form only works inside an existing
// 24-hour conversation window a first-time client won't have yet.
//
// Needs META_WHATSAPP_ACCESS_TOKEN (a permanent System User token — not
// the 24-hour token the Meta dashboard hands you by default, which would
// silently start failing a day after setup) and META_WHATSAPP_PHONE_NUMBER_ID
// (the registered sender's phone_number_id, not the phone number itself).

const GRAPH_VERSION = 'v21.0';

export function isWhatsAppConfigured() {
  return Boolean(process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendWhatsAppOtp(phoneDigits, code) {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.META_WHATSAPP_OTP_TEMPLATE_NAME || 'otp_login';
  const templateLang = process.env.META_WHATSAPP_OTP_TEMPLATE_LANG || 'en_US';
  // Meta's guided flow for an Authentication-category template defaults to
  // adding a "Copy Code" button, which needs its own components entry
  // below (separate from the body text) — set this to "false" if the
  // template was created without one (plain code-in-the-message style).
  const hasCopyCodeButton = process.env.META_WHATSAPP_OTP_HAS_BUTTON !== 'false';

  if (!accessToken || !phoneNumberId) {
    throw new Error('META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID is not configured');
  }

  const components = [{ type: 'body', parameters: [{ type: 'text', text: code }] }];
  if (hasCopyCodeButton) {
    components.push({
      type: 'button',
      sub_type: 'copy_code',
      index: '0',
      parameters: [{ type: 'coupon_code', coupon_code: code }],
    });
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneDigits,
      type: 'template',
      template: { name: templateName, language: { code: templateLang }, components },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody?.error?.message || `WhatsApp send failed (${res.status})`);
  }
}

// A staff reply on a WhatsApp thread (see app/api/clients/[id]/messages) —
// free-form text, not a template. Meta only allows this within 24 hours of
// the other party's last message (its "customer service window"); outside
// that a template message is required instead, which this deliberately
// doesn't attempt — a stale thread should surface as a clear "can't send"
// error rather than silently failing or double-billing a template send.
// Returns Meta's own message id (wamid...) so the caller can track this
// send's delivery status via the webhook's status callbacks.
export async function sendWhatsAppText(phoneDigits, body) {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    throw new Error('META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID is not configured');
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneDigits,
      type: 'text',
      text: { body },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `WhatsApp send failed (${res.status})`);
  }
  return data?.messages?.[0]?.id || null;
}
