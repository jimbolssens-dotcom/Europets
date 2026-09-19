// POST /api/whatsapp/send -> { to }
// One-off connectivity check for the Meta WhatsApp Cloud API credentials
// (META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID — see
// lib/metaWhatsapp.js, used for real by the client-app OTP login) — sends
// Meta's built-in "hello_world" template, which every WhatsApp Business
// app gets pre-approved with no setup, so this works even before our own
// otp_login template is approved. Not meant to stay wired into any UI;
// just a way to confirm a token/phone-number-id pair actually works,
// e.g. right after generating a new permanent token, without waiting on
// template approval to find out.
//
// No auth check of its own — this route isn't in middleware.js's
// PUBLIC_PATTERNS, so it's already behind the general staff PIN gate like
// every other non-public route in this app.

import { NextResponse } from 'next/server';

const GRAPH_VERSION = 'v21.0';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const to = String(body.to || '').replace(/\D/g, '');
  if (!to) {
    return NextResponse.json({ error: 'to is required (digits only, e.g. 971501234567)' }, { status: 400 });
  }

  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    return NextResponse.json(
      { error: 'META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID is not configured' },
      { status: 500 }
    );
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name: 'hello_world', language: { code: 'en_US' } },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data?.error?.message || `Send failed (${res.status})`, details: data }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}
