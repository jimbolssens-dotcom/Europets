// app/api/hospitalizations/[id]/route.js
// GET   /api/hospitalizations/:id  -> a single admission
// PATCH /api/hospitalizations/:id  -> update status/room/reason; discharging sets discharged_at

import { supabase } from '@/lib/supabaseClient';
import { attachCages } from '@/lib/attachCages';
import { NextResponse } from 'next/server';

// Next.js can otherwise cache a GET route handler's response (it has no
// dynamic API calls of its own to signal it shouldn't) — the client
// portal page polls this on every realtime event to stay "live", and a
// cached response would just keep returning whatever was true the first
// time anyone ever hit this URL, no matter how many times it's refetched.
export const dynamic = 'force-dynamic';

const SELECT_WITH_RELATIONS =
  '*, patients(id, name, species, current_weight_kg), clients(id, full_name, phone), rooms(name)';

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('hospitalizations')
    .select(SELECT_WITH_RELATIONS)
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json(await attachCages(data));
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { status, room_id, cage_id, reason, update_requested_at } = body;

  const update = {};
  if (status !== undefined) {
    if (!['admitted', 'discharged'].includes(status)) {
      return NextResponse.json(
        { error: "status must be 'admitted' or 'discharged'" },
        { status: 400 }
      );
    }
    update.status = status;
    if (status === 'discharged') update.discharged_at = new Date().toISOString();
  }
  if (room_id !== undefined) update.room_id = room_id;
  if (cage_id !== undefined) update.cage_id = cage_id;
  if (reason !== undefined) update.reason = reason;
  // Only ever set to null here (dismissing the "owner is waiting" flag from
  // staff's side) — the client portal sets the timestamp itself, via
  // POST /api/hospitalizations/:id/request-update.
  if (update_requested_at === null) update.update_requested_at = null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('hospitalizations')
    .update(update)
    .eq('id', params.id)
    .select(SELECT_WITH_RELATIONS)
    .single();

  if (error) {
    // The partial unique index on (cage_id) where status='admitted' blocks
    // assigning a cage that's already occupied by another admitted case.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That cage is already occupied.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(await attachCages(data));
}
