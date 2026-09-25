// app/api/whatsapp/create-client-app-link-template/route.js
// POST /api/whatsapp/create-client-app-link-template -> the one-time
// (safe to re-run) setup step for automated client-app-link sending:
// proposes the client_app_link template to Meta for review (see
// lib/metaWhatsapp.js's submitClientAppLinkTemplate). Nothing actually
// sends over WhatsApp until Meta approves it — that review is external
// and can't be triggered or sped up from here; check status afterward in
// WhatsApp Manager > Account tools > Message templates. Staff-gated like
// any other non-public route (see middleware.js) — triggered by a button
// on app/(admin)/messages, mirroring
// /api/whatsapp/create-hospitalization-portal-template.

import { submitClientAppLinkTemplate } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const data = await submitClientAppLinkTemplate(process.env.APP_URL);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
