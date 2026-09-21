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
// The "Copy Code" button Meta's guided template flow adds is implemented,
// on the wire, as a button component of sub_type "url" with a plain text
// parameter — not "copy_code" (confirmed empirically against a live
// account: sending sub_type "copy_code" fails with
// "(#132018) ... buttons: Button at index 0 must be of type Url").
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
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: code }],
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

// A one-time setup step that's easy to miss and gives no error anywhere
// when it's missing: registering the app's webhook URL + fields in Meta
// App Dashboard (see app/api/whatsapp/webhook) is necessary but NOT
// sufficient — the WhatsApp Business Account (WABA) itself also has to be
// explicitly told to route its events to this app, via this call. Skip it
// and every dashboard setting can show green while Meta silently never
// calls the webhook for real messages. Takes the WABA ID
// (META_WHATSAPP_WABA_ID — found in Meta Business Settings > Accounts >
// WhatsApp accounts, or on the App Dashboard's WhatsApp API Setup page),
// NOT the phone number ID used for sending — the /subscribed_apps edge
// only exists on the WABA object, not on an individual phone number
// (confirmed empirically: phone_number_id returns "Unsupported post
// request... does not support this operation"). Safe to call again later
// (e.g. after rotating the access token) — it's idempotent.
export async function subscribeWhatsAppWebhook() {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const wabaId = process.env.META_WHATSAPP_WABA_ID;
  if (!accessToken || !wabaId) {
    throw new Error('META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_WABA_ID is not configured');
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Subscribe failed (${res.status})`);
  }
  return data;
}

// Downloads a WhatsApp media object (a photo a client sent, see
// app/api/whatsapp/webhook) by its id. Two-step per Meta's Media API: the
// id alone isn't a fetchable URL — GET /{media-id} first resolves it to a
// short-lived CDN url, which itself also needs the same bearer token to
// actually download (a plain unauthenticated fetch of that url 403s).
// Returns the raw bytes so the caller can re-host them somewhere
// permanent — Meta only keeps media for a few days.
export async function downloadWhatsAppMedia(mediaId) {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('META_WHATSAPP_ACCESS_TOKEN is not configured');
  }

  const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meta = await metaRes.json().catch(() => ({}));
  if (!metaRes.ok || !meta.url) {
    throw new Error(meta?.error?.message || `Could not resolve media ${mediaId}`);
  }

  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!fileRes.ok) {
    throw new Error(`Media download failed (${fileRes.status})`);
  }
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return { buffer, mimeType: meta.mime_type || fileRes.headers.get('content-type') || 'application/octet-stream' };
}
