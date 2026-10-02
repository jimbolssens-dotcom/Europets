// app/api/staff/push/unsubscribe/route.js
// POST -> removes this phone's Web Push subscription — called when staff
// turn notifications back off (see StaffPushOptIn.jsx). Scoped to endpoint
// alone (not also staff_id): the browser's own subscription is the only
// thing that needs removing, and deleting by endpoint is still exactly
// one row either way (unique).

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : null;
  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('staff_push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
