// app/api/hospitalizations/[id]/passed-away/route.js
// Staff only. A patient passed away in hospital (migration 261).
// POST   { staff_id, passed_away_at? } -> marks it; from now every staff
//          screen shows the "tell the owner" alarm until owner-informed is
//          recorded. The stay stays open for the owner (their portal and
//          app show nothing new), but stops being charged from that night
//          (lib/hospitalizationCharges.js).
// DELETE -> undo a mistaken mark, only while the owner hasn't been told.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  if (!body.staff_id) return NextResponse.json({ error: 'Choose who is recording this.' }, { status: 400 });
  const at = body.passed_away_at ? new Date(body.passed_away_at) : new Date();
  if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 5 * 60 * 1000) {
    return NextResponse.json({ error: 'Enter when it happened (not in the future).' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from('hospitalizations')
    .update({ passed_away_at: at.toISOString(), passed_away_by: body.staff_id, owner_informed_at: null, owner_informed_by: null, owner_informed_how: null })
    .eq('id', params.id)
    .is('owner_informed_at', null)
    .select('id, passed_away_at')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found, or the owner was already told.' }, { status: 409 });
  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { data, error } = await supabaseAdmin
    .from('hospitalizations')
    .update({ passed_away_at: null, passed_away_by: null })
    .eq('id', params.id)
    .is('owner_informed_at', null)
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'The owner was already told; this can no longer be undone here.' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
