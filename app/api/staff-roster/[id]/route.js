// app/api/staff-roster/[id]/route.js
// PATCH  /api/staff-roster/:id { can_consult?, can_surgery? } -> set what
//        kind of booking this shift covers (see migration 050) — the
//        client booking form only offers a slot with a doctor flagged in
//        for the matching kind.
// DELETE /api/staff-roster/:id -> remove a staff member from a date+shift
// (taking themselves off the roster, or an admin/another staff member
// clearing it).

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function PATCH(request, { params }) {
  const body = await request.json();
  const update = {};
  if (body.can_consult !== undefined) update.can_consult = Boolean(body.can_consult);
  if (body.can_surgery !== undefined) update.can_surgery = Boolean(body.can_surgery);

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'can_consult and/or can_surgery is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('staff_roster_entries')
    .update(update)
    .eq('id', params.id)
    .select('*, staff(full_name, role)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { error } = await supabase.from('staff_roster_entries').delete().eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
