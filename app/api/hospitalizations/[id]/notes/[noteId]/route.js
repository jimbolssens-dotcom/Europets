// app/api/hospitalizations/[id]/notes/[noteId]/route.js
// PATCH /api/hospitalizations/:id/notes/:noteId -> edit an existing
// worksheet entry — everything a vet's full-form entry or a cleaner's
// Quick Check-In can set. updated_at bumps automatically so an edited
// entry is visibly different from a freshly-logged one.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const EDITABLE_FIELDS = [
  'note_date',
  'appetite',
  'condition',
  'notes',
  'stool',
  'urine',
  'vomit',
  'drinking',
  'mood',
  'temperature_feel',
  'medication_given',
  'force_feeding_done',
];
const EDITABLE_NUMBER_FIELDS = ['temperature_c', 'weight_kg'];

export async function PATCH(request, { params }) {
  const body = await request.json();
  const update = {};

  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field] === '' ? null : body[field];
  }
  for (const field of EDITABLE_NUMBER_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field] === '' || body[field] === null ? null : Number(body[field]);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('hospitalization_notes')
    .update(update)
    .eq('id', params.noteId)
    .eq('hospitalization_id', params.id)
    .select('*, staff(full_name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
