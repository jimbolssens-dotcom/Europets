// app/api/whatsapp/create-booking-confirmation-template/route.js
// POST /api/whatsapp/create-booking-confirmation-template -> the one-time
// (safe to re-run) setup step for automated booking-confirmation sending:
// proposes the booking_confirmation template to Meta for review (see
// lib/metaWhatsapp.js's submitBookingConfirmationTemplate). Nothing
// actually sends over WhatsApp until Meta approves it — that review is
// external and can't be triggered or sped up from here; check status
// afterward in WhatsApp Manager > Account tools > Message templates.
// Staff-gated like any other non-public route (see middleware.js) —
// triggered by a button on app/(admin)/messages, mirroring
// /api/whatsapp/create-vaccination-template.

import { submitBookingConfirmationTemplate } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const data = await submitBookingConfirmationTemplate();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
