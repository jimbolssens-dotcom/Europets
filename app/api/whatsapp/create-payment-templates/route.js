// app/api/whatsapp/create-payment-templates/route.js
// POST -> proposes the four payment templates (three invoice reminders and
// the payment link, see lib/metaWhatsapp.js) to Meta for review, skipping
// any Meta already has. The daily reminder run does the same on its own;
// this is the "Submit" button for them on app/(admin)/messages' WhatsApp
// setup. Staff-gated (middleware).

import { submitMissingPaymentReminderTemplates } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const data = await submitMissingPaymentReminderTemplates();
    const failed = data.submitted.filter((s) => s.error);
    if (failed.length) {
      return NextResponse.json({ error: failed.map((f) => `${f.name}: ${f.error}`).join('; '), data }, { status: 502 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
