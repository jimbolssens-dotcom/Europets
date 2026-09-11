// app/api/hospitalizations/[id]/route.js
// GET   /api/hospitalizations/:id  -> a single admission
// PATCH /api/hospitalizations/:id  -> update status/room/reason; discharging sets discharged_at.
//       Also: kind ('day_procedure' -> 'admission' — a day procedure that
//       needs to stay longer, promoted in place rather than re-created),
//       and originating_visit_id (linking a consult added afterward to a
//       day procedure that didn't start with one — see the "Add Consult"
//       button on the hospitalization page).

import { supabase } from '@/lib/supabaseClient';
import { attachCages } from '@/lib/attachCages';
import { compressAttachmentsForClosedRecord } from '@/lib/attachmentCompression';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

// Next.js can otherwise cache a GET route handler's response (it has no
// dynamic API calls of its own to signal it shouldn't) — the client
// portal page polls this on every realtime event to stay "live", and a
// cached response would just keep returning whatever was true the first
// time anyone ever hit this URL, no matter how many times it's refetched.
export const dynamic = 'force-dynamic';

const SELECT_WITH_RELATIONS =
  '*, patients(id, name, species, sex, patient_number, current_weight_kg, dental_chart), clients(id, full_name, phone, client_number), rooms(name)';

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
  const { status, room_id, cage_id, reason, update_requested_at, ai_summary, kind, originating_visit_id } = body;

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
  if (ai_summary !== undefined) update.ai_summary = ai_summary || null;
  if (kind !== undefined) {
    if (!['admission', 'day_procedure'].includes(kind)) {
      return NextResponse.json({ error: "kind must be 'admission' or 'day_procedure'" }, { status: 400 });
    }
    update.kind = kind;
  }
  if (originating_visit_id !== undefined) update.originating_visit_id = originating_visit_id || null;
  // Only ever set to null here (dismissing the "owner is waiting" flag from
  // staff's side) — the client portal sets the timestamp itself, via
  // POST /api/hospitalizations/:id/request-update.
  if (update_requested_at === null) {
    update.update_requested_at = null;
    update.update_request_message = null;
  }

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

  if (update.status === 'discharged') {
    // The case is closed — its photos won't be pulled up again the way
    // they are during an active admission, so shrink them now. Best-effort:
    // never let a compression hiccup fail the discharge itself.
    try {
      const { data: notes } = await supabase
        .from('hospitalization_notes')
        .select('id')
        .eq('hospitalization_id', params.id);

      const entityRefs = [
        { entity_type: 'hospitalization', entity_id: params.id },
        ...(notes || []).map((n) => ({ entity_type: 'hospitalization_note', entity_id: n.id })),
      ];
      await compressAttachmentsForClosedRecord(entityRefs);
    } catch {
      // See comment above — this is cleanup, not part of discharging the patient.
    }
  }

  return NextResponse.json(await attachCages(data));
}
