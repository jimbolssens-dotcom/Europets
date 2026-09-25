// app/api/intake-requests/[id]/send-whatsapp/route.js
// POST /api/intake-requests/:id/send-whatsapp -> sends this intake
// request's self-service link over WhatsApp from the clinic's own
// WhatsApp Business number, via a pre-approved template (see
// lib/metaWhatsapp.js's sendNewPatientIntakeLink) — never staff's own
// personal WhatsApp, which is what the Invite page's quick-send/resend
// buttons used to open instead (see lib/whatsapp.js's openWhatsApp, still
// used there as the fallback when this fails).
//
// Best-effort: the send failing (template not approved yet, no phone on
// file, send error) is reported back rather than thrown, so the page can
// fall back to the old manual-share flow instead of leaving staff with no
// way to get the link out at all.

import { sendIntakeLinkForRequest } from '@/lib/intakeInviteLink';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const result = await sendIntakeLinkForRequest(params.id);
  return NextResponse.json(result);
}
