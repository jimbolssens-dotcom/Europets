// app/api/staff/push/subscribe/route.js
// POST -> stores (or refreshes) this phone's Web Push subscription for one
// staff member — see StaffPushOptIn.jsx, the only caller. staff_id comes
// straight from the request body (whoever is picked in the mobile
// "Logging in as..." selector on that phone — see useMobileStaff), not a
// secure session: this app has no individual staff login, one shared
// clinic PIN gates every staff page (see middleware.js), same trust model
// already used for staff_id on a logged payment or treatment. Reachable
// only by staff in the first place (middleware's general PIN gate covers
// this route — it's not in PUBLIC_PATTERNS).
//
// Upserts on endpoint (the phone's own unique push URL) rather than
// inserting blindly — re-subscribing the same phone (toggling
// notifications off and on, someone else picking a different name on the
// SAME phone later) replaces its row rather than piling up duplicates.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const staffId = typeof body.staff_id === 'string' ? body.staff_id : null;
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : null;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!staffId) {
    return NextResponse.json({ error: 'staff_id is required' }, { status: 400 });
  }
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'endpoint and keys.p256dh/keys.auth are required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('staff_push_subscriptions').upsert(
    [
      {
        staff_id: staffId,
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
