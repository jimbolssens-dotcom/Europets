// app/api/client-app/push/subscribe/route.js
// POST -> stores (or refreshes) this browser's Web Push subscription for
// the logged-in client — see ClientAppPushOptIn.jsx, the only caller.
// Public under /api/client-app/* (see middleware.js) — authorized by the
// client's own session cookie, exactly like every other client-app route
// (see lib/clientAppAuth.js's getClientSession), never by a client_id
// the request just hands over.
//
// Upserts on endpoint (the browser's own unique push URL) rather than
// inserting blindly — re-subscribing the same browser (toggling
// notifications off and on, a token the browser silently rotated) should
// replace its row, not pile up duplicates that would each get sent to
// independently.

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
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'endpoint and keys.p256dh/keys.auth are required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('client_push_subscriptions').upsert(
    [
      {
        client_id: clientId,
        endpoint,
        p256dh,
        auth,
        user_agent: request.headers.get('user-agent') || null,
      },
    ],
    { onConflict: 'endpoint' }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
