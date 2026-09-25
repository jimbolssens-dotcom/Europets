// app/api/client-app-link/send/route.js
// POST /api/client-app-link/send -> sends the client-app install/login
// link over WhatsApp from the clinic's own WhatsApp Business number, via
// a pre-approved template (see lib/metaWhatsapp.js's
// sendClientAppLinkMessage) — never staff's own personal WhatsApp, which
// is what the Invite page's "Client App Link" button used to open
// instead (see lib/whatsapp.js's openWhatsApp, still used there as the
// fallback when this fails). Body: { phone }.
//
// Best-effort: the send failing (template not approved yet, send error)
// is reported back rather than thrown, so the page can fall back to the
// old manual-share flow.

import { sendClientAppLinkForPhone } from '@/lib/clientAppInviteLink';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const result = await sendClientAppLinkForPhone(body.phone);
  return NextResponse.json(result);
}
