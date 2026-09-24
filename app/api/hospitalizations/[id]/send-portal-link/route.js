// app/api/hospitalizations/[id]/send-portal-link/route.js
// POST /api/hospitalizations/:id/send-portal-link -> sends this
// admission's client portal link ("here's the live care-update page")
// over WhatsApp from the clinic's own WhatsApp Business number, via a
// pre-approved template (see lib/metaWhatsapp.js's
// sendHospitalizationPortalLink) — never staff's own personal WhatsApp,
// which is what the "Share" button on the hospitalization page used to
// open instead (see lib/whatsapp.js's openWhatsApp, still used there as
// the fallback when this fails).
//
// The actual send lives in lib/hospitalizationPortalLink.js, shared with
// the automatic send fired the moment a consent form comes back signed
// (see POST /api/consent-form-requests/[id]) — this route is just the
// manual trigger for it (a resend, or the fallback for an admission with
// no consent form on file at all).
//
// Best-effort: the send failing (template not approved yet, no phone on
// file, already sent, ...) is reported back rather than thrown, so the
// page can fall back to the old manual-share flow instead of leaving
// staff with no way to get the link to the client at all.

import { sendHospitalizationPortalLinkForAdmission } from '@/lib/hospitalizationPortalLink';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const result = await sendHospitalizationPortalLinkForAdmission(params.id);
  return NextResponse.json(result);
}
