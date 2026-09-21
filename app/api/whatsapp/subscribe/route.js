// app/api/whatsapp/subscribe/route.js
// POST /api/whatsapp/subscribe -> the one-time (and idempotent — safe to
// re-run) fix for "the webhook is configured correctly in Meta App
// Dashboard but nothing ever arrives": the phone number itself also has to
// be explicitly subscribed to this app's webhook (see
// lib/metaWhatsapp.js's subscribeWhatsAppWebhook). Staff-gated like any
// other non-public route (see middleware.js) — triggered by a button on
// app/(admin)/messages, not meant to run automatically or repeatedly.

import { subscribeWhatsAppWebhook } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const data = await subscribeWhatsAppWebhook();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
