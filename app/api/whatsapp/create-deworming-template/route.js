// app/api/whatsapp/create-deworming-template/route.js
// POST -> proposes the deworming_reminder WhatsApp template to Meta for
// review (lib/metaWhatsapp.js submitDewormingReminderTemplate). Safe to
// re-run. Staff-gated; the Submit button on app/(admin)/messages.

import { submitDewormingReminderTemplate } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const data = await submitDewormingReminderTemplate();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
