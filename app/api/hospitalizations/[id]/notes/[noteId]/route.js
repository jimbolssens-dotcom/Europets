// app/api/hospitalizations/[id]/notes/[noteId]/route.js
// PATCH /api/hospitalizations/:id/notes/:noteId -> edit an existing
// worksheet entry — everything a vet's full-form entry or a cleaner's
// Quick Check-In can set. updated_at bumps automatically so an edited
// entry is visibly different from a freshly-logged one.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const EDITABLE_FIELDS = [
  'note_date',
  'author_id',
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
  'client_summary',
];
const EDITABLE_NUMBER_FIELDS = ['temperature_c', 'weight_kg'];
// Not run through the '' -> null coercion below — plan_item_ids is always
// a full array (see DayTreatmentPlan.jsx's logTask consolidating several
// taps within a few minutes into this one entry's array).
const EDITABLE_ARRAY_FIELDS = ['plan_item_ids'];

export async function DELETE(request, { params }) {
  const { data: note, error: lookupError } = await supabase.from('hospitalization_notes')
    .select('id').eq('id', params.noteId).eq('hospitalization_id', params.id).maybeSingle();
  if (lookupError) return NextResponse.json({ error: 'Could not load the worksheet entry.' }, { status: 500 });
  if (!note) return NextResponse.json({ error: 'Worksheet entry not found.' }, { status: 404 });

  // Preserve source files under the case instead of leaving orphan attachments.
  const { error: attachmentError } = await supabase.from('attachments')
    .update({ entity_type: 'hospitalization', entity_id: params.id })
    .eq('entity_type', 'hospitalization_note').eq('entity_id', note.id);
  if (attachmentError) return NextResponse.json({ error: 'Could not preserve the attached files. Entry was not deleted.' }, { status: 500 });

  // The existing foreign key cascades this entry's treatment_items.
  // Invoice line items are independent and are not modified here.
  const { data: deleted, error } = await supabase.from('hospitalization_notes')
    .delete().eq('id', note.id).eq('hospitalization_id', params.id).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not delete the worksheet entry.' }, { status: 500 });
  if (!deleted) return NextResponse.json({ error: 'Worksheet entry not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  const update = {};

  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field] === '' ? null : body[field];
  }
  for (const field of EDITABLE_NUMBER_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field] === '' || body[field] === null ? null : Number(body[field]);
  }
  for (const field of EDITABLE_ARRAY_FIELDS) {
    if (Array.isArray(body[field])) update[field] = body[field];
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
