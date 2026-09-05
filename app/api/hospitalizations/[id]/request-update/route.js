// app/api/hospitalizations/[id]/request-update/route.js
// POST /api/hospitalizations/:id/request-update
//   -> owner-facing: flags this admission as waiting on a staff update,
//      with an optional short note ({ message }) — e.g. "is she eating
//      yet?" — carried alongside the flag. Powers "Request an Update" on
//      the client portal page. Staff see it as a blinking cage on the
//      Cage Layout page (desktop and mobile) until it's cleared — either
//      automatically, the moment a new worksheet entry is logged (see the
//      notes route, which also clears the message), or manually via
//      PATCH /api/hospitalizations/:id { update_requested_at: null }.
//
// Unauthenticated like the rest of the portal — there's no client login,
// same as everywhere else in the app.

import { supabase } from '@/lib/supabaseClient';
import { attachCages } from '@/lib/attachCages';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : null;

  const { data, error } = await supabase
    .from('hospitalizations')
    .update({ update_requested_at: new Date().toISOString(), update_request_message: message || null })
    .eq('id', params.id)
    .select('*, patients(id, name, species, current_weight_kg), clients(id, full_name, phone), rooms(name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(await attachCages(data));
}
