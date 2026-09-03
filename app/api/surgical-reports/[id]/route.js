// app/api/surgical-reports/[id]/route.js
// GET   /api/surgical-reports/:id  -> one surgical report, with the visit's
//                                     patient/client joined (needed for the
//                                     post-op release PDF/share links).
// PATCH /api/surgical-reports/:id  -> edit any of its fields — used both for
//                                     the existing fields and for saving the
//                                     vet-reviewed postop_instructions once
//                                     they've approved an AI draft (see
//                                     app/api/surgical-reports/[id]/generate-postop).

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const EDITABLE_FIELDS = ['surgeon_id', 'procedure_name', 'notes', 'postop_instructions'];

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('surgical_reports')
    .select(
      '*, staff(full_name), visits(patient_id, client_id, patients(name, species, patient_number, microchip_number), clients(full_name, phone, email, client_number))'
    )
    .eq('id', params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'surgical report not found' }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field] === '' ? null : body[field];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('surgical_reports')
    .update(update)
    .eq('id', params.id)
    .select('*, staff(full_name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
