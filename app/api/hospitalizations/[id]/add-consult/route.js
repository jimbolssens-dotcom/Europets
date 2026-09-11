// app/api/hospitalizations/[id]/add-consult/route.js
// POST /api/hospitalizations/:id/add-consult -> for a day procedure (or
// admission) that didn't start from a consult and doesn't have one yet,
// create one now and link it back via hospitalizations.originating_visit_id
// — the same relationship the usual consult-first flow sets up, just in
// the other order. Once linked, the consult and hospitalization pages find
// each other exactly the way they already do for a consult-first case.
//
// Most day procedures never need this — it's an opt-in "also write up an
// exam note for this" escape hatch, not part of the default flow.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { room_id } = body;

  const { data: admission, error: admissionError } = await supabase
    .from('hospitalizations')
    .select('patient_id, client_id, room_id, originating_visit_id')
    .eq('id', params.id)
    .single();

  if (admissionError || !admission) {
    return NextResponse.json({ error: 'admission not found' }, { status: 404 });
  }

  if (admission.originating_visit_id) {
    const { data: existingVisit } = await supabase
      .from('visits')
      .select('*')
      .eq('id', admission.originating_visit_id)
      .single();
    if (existingVisit) return NextResponse.json(existingVisit);
  }

  const resolvedRoomId = room_id || admission.room_id;
  if (!resolvedRoomId) {
    return NextResponse.json({ error: 'room_id is required — this case has no room assigned yet' }, { status: 400 });
  }

  const { data: visit, error: visitError } = await supabase
    .from('visits')
    .insert([
      {
        patient_id: admission.patient_id,
        client_id: admission.client_id,
        room_id: resolvedRoomId,
        status: 'in_progress',
      },
    ])
    .select()
    .single();

  if (visitError) {
    return NextResponse.json({ error: visitError.message }, { status: 500 });
  }

  const { error: linkError } = await supabase
    .from('hospitalizations')
    .update({ originating_visit_id: visit.id })
    .eq('id', params.id);

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  return NextResponse.json(visit, { status: 201 });
}
