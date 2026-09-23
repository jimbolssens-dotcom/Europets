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

// A staff reply that's a photo or file rather than plain text — same
// free-form-within-24h-window constraint as sendWhatsAppText above, just
// a different message type. Meta fetches the media itself from `url`
// (must be publicly reachable — the "consult-files" Storage bucket every
// other upload in this app already uses), so there's no separate upload
// step against Meta's own Media API the way an inbound photo's download
// needs (see downloadWhatsAppMedia below, which is the reverse direction).
export async function sendWhatsAppMedia(phoneDigits, { url, contentType, caption, filename }) {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    throw new Error('META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID is not configured');
  }

  const type = contentType?.startsWith('image/')
    ? 'image'
    : contentType?.startsWith('video/')
      ? 'video'
      : 'document';
  const mediaPayload = { link: url };
  if (caption) mediaPayload.caption = caption;
  if (type === 'document' && filename) mediaPayload.filename = filename;

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneDigits,
      type,
      [type]: mediaPayload,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `WhatsApp media send failed (${res.status})`);
  }
  return data?.messages?.[0]?.id || null;
}

// Sends "your consent form is ready to sign" as a business-initiated
// template — introducing a client to this WhatsApp number is the whole
// point (most haven't messaged it before), so like the OTP send above
// this can't use sendWhatsAppText's free-form path; it needs its own
// pre-approved template (Meta's Authentication category used for the OTP
// one is restricted to login codes, so this is a separate "Utility"
// category template — see submitConsentFormTemplate below to propose it).
// consentUrl is the full /portal/consent/:id link; only the :id segment
// actually varies per send, which is what the template's dynamic URL
// button parameter carries.
export async function sendConsentFormRequest(phoneDigits, { clientName, patientName, formLabel, consentUrl }) {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.META_WHATSAPP_CONSENT_TEMPLATE_NAME || 'consent_form_ready';
  const templateLang = process.env.META_WHATSAPP_CONSENT_TEMPLATE_LANG || 'en_US';

  if (!accessToken || !phoneNumberId) {
    throw new Error('META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID is not configured');
  }

  const urlId = consentUrl.split('/portal/consent/')[1] || '';

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: clientName || 'there' },
        { type: 'text', text: patientName || 'your pet' },
        { type: 'text', text: formLabel },
      ],
    },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: urlId }] },
  ];

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneDigits,
      type: 'template',
      template: { name: templateName, language: { code: templateLang }, components },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `WhatsApp send failed (${res.status})`);
  }
  return data?.messages?.[0]?.id || null;
}

// One-time setup: proposes the consent_form_ready template to Meta for
// review, via the API (POST .../message_templates) instead of clicking
// through WhatsApp Manager's own template builder — see the "Fix
// WhatsApp subscription" pattern this mirrors. Meta's own human/automated
// review of the submission (typically minutes to about a day for a
// Utility-category template) can't be triggered or sped up from here;
// check its status afterward in WhatsApp Manager > Account tools >
// Message templates. Safe to call again if it's rejected and needs
// re-submitting with edited wording.
export async function submitConsentFormTemplate(appUrl) {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const wabaId = process.env.META_WHATSAPP_WABA_ID;
  const templateName = process.env.META_WHATSAPP_CONSENT_TEMPLATE_NAME || 'consent_form_ready';
  const templateLang = process.env.META_WHATSAPP_CONSENT_TEMPLATE_LANG || 'en_US';

  if (!accessToken || !wabaId) {
    throw new Error('META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_WABA_ID is not configured');
  }
  if (!appUrl) {
    throw new Error('APP_URL is not configured — needed to build the template\'s sign-in link');
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: templateName,
      language: templateLang,
      category: 'UTILITY',
      components: [
        {
          type: 'BODY',
          // Meta rejects a body whose first/last token is a variable (only
          // punctuation trailing a placeholder doesn't count as real text)
          // — real words have to open and close it.
          text: 'Hi {{1}}, please review and sign the {{3}} for {{2}} at Europets Veterinary Clinic.',
          example: { body_text: [['Jim', 'Bruce', 'Dental Procedure Consent']] },
        },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'URL',
              text: 'View & Sign',
              url: `${appUrl}/portal/consent/{{1}}`,
              example: ['00000000-0000-0000-0000-000000000000'],
            },
          ],
        },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Meta's top-level error.message is usually a generic label ("Invalid
    // parameter") — the actually-useful reason lives in error_data.details
    // or error_user_msg, which the UI otherwise never sees.
    const err = data?.error || {};
    const detail = err.error_data?.details || err.error_user_msg;
    throw new Error([err.message, detail].filter(Boolean).join(' — ') || `Template submission failed (${res.status})`);
  }
  return data;
}

// Sends "here's your pet's live care-update page" as a business-initiated
// template — same reasoning as sendConsentFormRequest just above: staff
// send this the moment an admission starts or a consent form comes back
// signed, with no guarantee the client has ever messaged this number
// before, so it can't rely on the free-form path. Previously this only
// ever opened *staff's own personal* WhatsApp (lib/whatsapp.js's
// openWhatsApp) for them to send by hand — sent automatically from here
// instead, from the clinic's own WhatsApp Business number. portalUrl is
// the full /portal/hospitalization/:id link; only the :id segment varies
// per send, carried by the template's dynamic URL button parameter.
export async function sendHospitalizationPortalLink(phoneDigits, { clientName, patientName, portalUrl }) {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.META_WHATSAPP_HOSPITALIZATION_TEMPLATE_NAME || 'hospitalization_portal_link';
  const templateLang = process.env.META_WHATSAPP_HOSPITALIZATION_TEMPLATE_LANG || 'en_US';

  if (!accessToken || !phoneNumberId) {
    throw new Error('META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID is not configured');
  }

  const urlId = portalUrl.split('/portal/hospitalization/')[1] || '';

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: clientName || 'there' },
        { type: 'text', text: patientName || 'your pet' },
      ],
    },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: urlId }] },
  ];

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneDigits,
      type: 'template',
      template: { name: templateName, language: { code: templateLang }, components },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `WhatsApp send failed (${res.status})`);
  }
  return data?.messages?.[0]?.id || null;
}

// One-time setup: proposes the hospitalization_portal_link template to
// Meta for review — see submitConsentFormTemplate above for the pattern.
export async function submitHospitalizationPortalTemplate(appUrl) {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const wabaId = process.env.META_WHATSAPP_WABA_ID;
  const templateName = process.env.META_WHATSAPP_HOSPITALIZATION_TEMPLATE_NAME || 'hospitalization_portal_link';
  const templateLang = process.env.META_WHATSAPP_HOSPITALIZATION_TEMPLATE_LANG || 'en_US';

  if (!accessToken || !wabaId) {
    throw new Error('META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_WABA_ID is not configured');
  }
  if (!appUrl) {
    throw new Error('APP_URL is not configured — needed to build the template\'s portal link');
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: templateName,
      language: templateLang,
      category: 'UTILITY',
      components: [
        {
          type: 'BODY',
          text: 'Hi {{1}}, here\'s the live care-update page for {{2}} during their stay with us at Europets Veterinary Clinic.',
          example: { body_text: [['Jim', 'Bruce']] },
        },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'URL',
              text: 'View Updates',
              url: `${appUrl}/portal/hospitalization/{{1}}`,
              example: ['00000000-0000-0000-0000-000000000000'],
            },
          ],
        },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error || {};
    const detail = err.error_data?.details || err.error_user_msg;
    throw new Error([err.message, detail].filter(Boolean).join(' — ') || `Template submission failed (${res.status})`);
  }
  return data;
}

// Sends a vaccination due/overdue reminder as a business-initiated
// template, for the same reason as sendConsentFormRequest above: this has
// to reach clients regardless of an existing WhatsApp conversation. Unlike
// the consent form's URL button, this carries a QUICK_REPLY button
// ("Book Appointment") — tapping it sends its own text back as an
// ordinary inbound message (see the webhook's handling of message.type
// 'button'), which lands the client straight in a normal conversation
// with the AI concierge (lib/whatsappConcierge.js), with this reminder
// itself as the immediately-preceding context so it knows which pet and
// vaccine the client means without being told again. No special booking
// logic needed here — it's exactly the concierge's existing routine-
// consult booking flow, just entered via a tap instead of typing.
export async function sendVaccinationReminder(phoneDigits, { clientName, patientName, vaccineNames, dueDateLabel }) {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.META_WHATSAPP_VACCINATION_TEMPLATE_NAME || 'vaccination_reminder';
  const templateLang = process.env.META_WHATSAPP_VACCINATION_TEMPLATE_LANG || 'en_US';

  if (!accessToken || !phoneNumberId) {
    throw new Error('META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID is not configured');
  }

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: clientName || 'there' },
        { type: 'text', text: patientName || 'your pet' },
        { type: 'text', text: vaccineNames },
        { type: 'text', text: dueDateLabel },
      ],
    },
  ];

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneDigits,
      type: 'template',
      template: { name: templateName, language: { code: templateLang }, components },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `WhatsApp send failed (${res.status})`);
  }
  return data?.messages?.[0]?.id || null;
}

// One-time setup: proposes the vaccination_reminder template to Meta for
// review — see submitConsentFormTemplate above for the pattern. The
// QUICK_REPLY button's text is fixed (unlike a URL button, it carries no
// per-send variable), and is what the client taps to start booking.
export async function submitVaccinationReminderTemplate() {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const wabaId = process.env.META_WHATSAPP_WABA_ID;
  const templateName = process.env.META_WHATSAPP_VACCINATION_TEMPLATE_NAME || 'vaccination_reminder';
  const templateLang = process.env.META_WHATSAPP_VACCINATION_TEMPLATE_LANG || 'en_US';

  if (!accessToken || !wabaId) {
    throw new Error('META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_WABA_ID is not configured');
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: templateName,
      language: templateLang,
      category: 'UTILITY',
      components: [
        {
          type: 'BODY',
          text: 'Hi {{1}}, this is a reminder that {{2}}\'s {{3}} vaccination is due on {{4}}. Reply below to book an appointment at Europets Veterinary Clinic.',
          example: { body_text: [['Jim', 'Bruce', 'Rabies', '1 October 2026']] },
        },
        {
          type: 'BUTTONS',
          buttons: [{ type: 'QUICK_REPLY', text: 'Book Appointment' }],
        },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error || {};
    const detail = err.error_data?.details || err.error_user_msg;
    throw new Error([err.message, detail].filter(Boolean).join(' — ') || `Template submission failed (${res.status})`);
  }
  return data;
}

// Sends "your appointment is confirmed" as a business-initiated template —
// same reasoning as sendConsentFormRequest/sendVaccinationReminder above:
// a request approved right after it's submitted has no guarantee of an
// open 24-hour window (the client's own submission isn't itself an
// inbound WhatsApp message unless they came in via the WhatsApp concierge
// specifically), so this can't rely on the free-form path either. Sent
// automatically from POST-approval in app/api/intake-requests/[id] —
// previously this step just handed the confirmed slot back to the staff
// UI, which opened *staff's own personal* WhatsApp (lib/whatsapp.js's
// openWhatsApp) for them to send by hand. This sends from the clinic's
// own WhatsApp Business number instead, automatically. Same wording as
// the manual fallback message in lib/useIntakeReview.js, kept for when
// this template isn't approved yet or the send otherwise fails.
export async function sendBookingConfirmation(phoneDigits, { clientName, patientName, dateLabel, timeLabel }) {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.META_WHATSAPP_BOOKING_TEMPLATE_NAME || 'booking_confirmation';
  const templateLang = process.env.META_WHATSAPP_BOOKING_TEMPLATE_LANG || 'en_US';

  if (!accessToken || !phoneNumberId) {
    throw new Error('META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID is not configured');
  }

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: clientName || 'there' },
        { type: 'text', text: patientName || 'your pet' },
        { type: 'text', text: dateLabel },
        { type: 'text', text: timeLabel },
      ],
    },
  ];

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneDigits,
      type: 'template',
      template: { name: templateName, language: { code: templateLang }, components },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `WhatsApp send failed (${res.status})`);
  }
  return data?.messages?.[0]?.id || null;
}

// One-time setup: proposes the booking_confirmation template to Meta for
// review — see submitConsentFormTemplate above for the pattern.
export async function submitBookingConfirmationTemplate() {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const wabaId = process.env.META_WHATSAPP_WABA_ID;
  const templateName = process.env.META_WHATSAPP_BOOKING_TEMPLATE_NAME || 'booking_confirmation';
  const templateLang = process.env.META_WHATSAPP_BOOKING_TEMPLATE_LANG || 'en_US';

  if (!accessToken || !wabaId) {
    throw new Error('META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_WABA_ID is not configured');
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: templateName,
      language: templateLang,
      category: 'UTILITY',
      components: [
        {
          type: 'BODY',
          text: 'Hi {{1}}, your appointment for {{2}} at Europets Veterinary Clinic is confirmed for {{3}} at {{4}}. See you then!',
          example: { body_text: [['Jim', 'Bruce', 'Monday 28/09', '10:30 AM']] },
        },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error || {};
    const detail = err.error_data?.details || err.error_user_msg;
    throw new Error([err.message, detail].filter(Boolean).join(' — ') || `Template submission failed (${res.status})`);
  }
  return data;
}

// Sends a staff-written message to a client who has no open 24-hour
// WhatsApp window (never messaged this number, or not recently enough) —
// the free-form path (sendWhatsAppText) only works within that window,
// and fails there in a way that's easy to miss: Meta's send API can
// accept the request and only report the failure moments later, async,
// via the status webhook (see app/api/whatsapp/webhook's handleStatusUpdate
// and client_messages.wa_error) — which is exactly what happened trying
// to introduce a client to this number for the first time with a plain
// reply. clientMessage is the staff-typed text; the template wraps it
// with the clinic's name so it can't be a bare, unbranded first message.
export async function sendFirstContactMessage(phoneDigits, { clientName, clientMessage }) {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.META_WHATSAPP_FIRST_CONTACT_TEMPLATE_NAME || 'clinic_message';
  const templateLang = process.env.META_WHATSAPP_FIRST_CONTACT_TEMPLATE_LANG || 'en_US';

  if (!accessToken || !phoneNumberId) {
    throw new Error('META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID is not configured');
  }

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: clientName || 'there' },
        { type: 'text', text: clientMessage },
      ],
    },
  ];

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneDigits,
      type: 'template',
      template: { name: templateName, language: { code: templateLang }, components },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `WhatsApp send failed (${res.status})`);
  }
  return data?.messages?.[0]?.id || null;
}

// One-time setup: proposes the clinic_message template to Meta for review
// — see submitConsentFormTemplate above for the pattern. Deliberately
// generic (a single free-text variable) so it covers any first-contact
// message rather than one fixed scenario, unlike the consent-form/
// vaccination templates — Meta reviews this kind of general utility
// template routinely, but if it's ever rejected as too open-ended, the
// fix is narrowing the body's wording, not the variable itself.
export async function submitFirstContactTemplate() {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const wabaId = process.env.META_WHATSAPP_WABA_ID;
  const templateName = process.env.META_WHATSAPP_FIRST_CONTACT_TEMPLATE_NAME || 'clinic_message';
  const templateLang = process.env.META_WHATSAPP_FIRST_CONTACT_TEMPLATE_LANG || 'en_US';

  if (!accessToken || !wabaId) {
    throw new Error('META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_WABA_ID is not configured');
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: templateName,
      language: templateLang,
      category: 'UTILITY',
      components: [
        {
          type: 'BODY',
          text: 'Hi {{1}}, this is Europets Veterinary Clinic: {{2}} We\'re here on WhatsApp if you need us.',
          example: {
            body_text: [['Jim', 'This is a reminder that Bruce is due for a check-up — please give us a call to book.']],
          },
        },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error || {};
    const detail = err.error_data?.details || err.error_user_msg;
    throw new Error([err.message, detail].filter(Boolean).join(' — ') || `Template submission failed (${res.status})`);
  }
  return data;
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
