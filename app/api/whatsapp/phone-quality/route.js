// app/api/whatsapp/phone-quality/route.js
// GET /api/whatsapp/phone-quality -> this number's live Quality Rating and
// Messaging Limit Tier straight from Meta (see lib/metaWhatsapp.js's
// getPhoneNumberQuality) — for diagnosing a "failed" WhatsApp send whose
// reason text doesn't point at template approval or the 24h window.
// Triggered by a button on app/(admin)/messages, mirroring the other
// one-off WhatsApp diagnostics on that page.

import { getPhoneNumberQuality } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const data = await getPhoneNumberQuality();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
