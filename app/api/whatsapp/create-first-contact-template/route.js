// app/api/whatsapp/create-first-contact-template/route.js
// POST /api/whatsapp/create-first-contact-template -> the one-time (safe
// to re-run) setup step for reaching a client who has no open WhatsApp
// window: proposes the clinic_message template to Meta for review (see
// lib/metaWhatsapp.js's submitFirstContactTemplate). Nothing actually
// sends until Meta approves it — check status in WhatsApp Manager >
// Account tools > Message templates. Staff-gated like any other
// non-public route (see middleware.js) — triggered by a button on
// app/(admin)/messages, mirroring create-consent-template/
// create-vaccination-template.

import { submitFirstContactTemplate } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const data = await submitFirstContactTemplate();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
