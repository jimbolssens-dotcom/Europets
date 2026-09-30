// app/api/client-app/push/unsubscribe/route.js
// POST -> removes this browser's Web Push subscription — called when a
// client turns notifications back off from within the app (see
// ClientAppPushOptIn.jsx). Scoped to both endpoint AND the caller's own
// session client_id, so one client can only ever remove their own
// subscription rows, never guess at someone else's endpoint.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getClientSession } from '@/lib/clientAppAuth';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const clientId = await getClientSession(request);
  if (!clientId) {
    return NextResponse.json({ error: 'not authorized' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : null;
  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('client_push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('client_id', clientId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
