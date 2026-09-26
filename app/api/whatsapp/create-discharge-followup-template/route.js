// app/api/whatsapp/create-discharge-followup-template/route.js
// POST /api/whatsapp/create-discharge-followup-template -> the one-time
// (safe to re-run) setup step for the discharge follow-ups feature: proposes
// the discharge_followup_checkin template to Meta for review (see
// lib/metaWhatsapp.js's submitDischargeFollowupTemplate). Nothing sends over
// WhatsApp until Meta approves it — check status afterward in WhatsApp
// Manager > Account tools > Message templates. Staff-gated like any other
// non-public route (see middleware.js) — triggered by a button on
// app/(admin)/messages, mirroring /api/whatsapp/create-intake-template.

import { submitDischargeFollowupTemplate } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const data = await submitDischargeFollowupTemplate();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
