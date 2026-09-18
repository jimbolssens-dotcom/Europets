// app/api/clients/[id]/app-seen/route.js
// POST /api/clients/:id/app-seen -> stamps clients.client_app_last_seen_at
// with now(). Pinged once per page load from useClientAppSession, so staff
// can tell whether a client actually uses the client app — e.g. to decide
// whether to send a consent form there instead of over WhatsApp (see
// sendConsentLink on the hospitalization page). Deliberately its own tiny
// route rather than folded into the general clients PATCH, since this one
// needs to keep working once the client app is opened up to real clients
// who won't have staff-level access to edit their own record.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const { error } = await supabaseAdmin
    .from('clients')
    .update({ client_app_last_seen_at: new Date().toISOString() })
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
