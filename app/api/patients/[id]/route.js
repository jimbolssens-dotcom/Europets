// app/api/patients/[id]/route.js
// GET    /api/patients/:id  -> a single patient, with owner info
// PATCH  /api/patients/:id  -> edit a patient (including marking deceased)
// DELETE /api/patients/:id  -> remove a patient (blocked if it has appointments/visits)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const EDITABLE_FIELDS = [
  'name',
  'species',
  'breed',
  'color',
  'date_of_birth',
  'sex',
  'current_weight_kg',
  'microchip_number',
  'microchip_implanted_at',
  'deceased',
  'notes',
  'dental_chart',
];

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('patients')
    .select('*, clients(id, client_number, full_name, phone, email)')
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('patients')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'that microchip number is already registered to another patient' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { error } = await supabase.from('patients').delete().eq('id', params.id);

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'cannot delete this patient — it has existing appointments or visits' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
