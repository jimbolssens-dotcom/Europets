// app/api/patients/[id]/history-link/route.js
// GET -> { url, expires_at }: a fresh signed link to this patient's history
// PDF (lib/historyLink.js) for staff to WhatsApp or email to the owner.
// Staff only (behind the staff login in middleware.js).

import { NextResponse } from 'next/server';
import { historyLinkQuery, HISTORY_LINK_DAYS } from '@/lib/historyLink';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  // The client-facing domain, same as the other links sent to owners.
  const origin = process.env.APP_URL || new URL(request.url).origin;
  return NextResponse.json({
    url: `${origin}/api/patients/${params.id}/history-pdf?${historyLinkQuery(params.id)}`,
    expires_at: new Date(Date.now() + HISTORY_LINK_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  });
}
