// app/api/whatsapp/template-statuses/route.js
// GET /api/whatsapp/template-statuses -> { firstContact: 'APPROVED' | null,
// bookingConfirmation: ..., ... } straight from Meta, keyed by the fixed
// purposes app/(admin)/messages has a button for, so the "Submit ...
// WhatsApp template" buttons can show a real mark next to whichever ones
// are already approved/pending instead of leaving staff to guess or
// re-click one that's already done.

import { getKnownTemplateStatuses } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const statuses = await getKnownTemplateStatuses();
    return NextResponse.json(statuses);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
