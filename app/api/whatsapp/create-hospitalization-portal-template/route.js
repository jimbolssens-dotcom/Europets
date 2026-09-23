// app/api/whatsapp/create-hospitalization-portal-template/route.js
// POST /api/whatsapp/create-hospitalization-portal-template -> the
// one-time (safe to re-run) setup step for automated hospitalization
// portal-link sending: proposes the hospitalization_portal_link template
// to Meta for review (see lib/metaWhatsapp.js's
// submitHospitalizationPortalTemplate). Nothing actually sends over
// WhatsApp until Meta approves it — that review is external and can't be
// triggered or sped up from here; check status afterward in WhatsApp
// Manager > Account tools > Message templates. Staff-gated like any
// other non-public route (see middleware.js) — triggered by a button on
// app/(admin)/messages, mirroring /api/whatsapp/create-consent-template.

import { submitHospitalizationPortalTemplate } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const data = await submitHospitalizationPortalTemplate(process.env.APP_URL);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
