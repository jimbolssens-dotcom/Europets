// app/api/visits/[id]/route.js
// GET   /api/visits/:id  -> a single consult, with patient/client/room/vet joins
// PATCH /api/visits/:id  -> update status and/or the medical record fields.
// Completing a consult sets ended_at and also completes its linked
// appointment. Updating weight_kg also syncs the patient's current weight.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const VALID_STATUSES = ['in_progress', 'complete'];
const RECORD_FIELDS = [
  'weight_kg',
  'temperature_c',
  'body_condition_score',
  'anamnesis',
  'findings',
  'prognosis',
  'treatment_notes',
];

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('visits')
    .select(
      '*, patients(id, name, species, breed, current_weight_kg, deceased), clients(id, full_name, phone), rooms(name), staff(full_name)'
    )
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { status } = body;

  const update = {};
  for (const field of RECORD_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field] === '' ? null : body[field];
  }

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }
    update.status = status;
    if (status === 'complete') {
      update.ended_at = new Date().toISOString();
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('visits')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (update.weight_kg !== undefined && update.weight_kg !== null) {
    await supabase
      .from('patients')
      .update({ current_weight_kg: update.weight_kg })
      .eq('id', data.patient_id);
  }

  if (status === 'complete' && data.appointment_id) {
    await supabase
      .from('appointments')
      .update({ status: 'complete' })
      .eq('id', data.appointment_id);
  }

  return NextResponse.json(data);
}
