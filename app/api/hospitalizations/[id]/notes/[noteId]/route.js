// app/api/hospitalizations/[id]/notes/[noteId]/route.js
// PATCH /api/hospitalizations/:id/notes/:noteId  -> edit a worksheet entry
//
// Bumps updated_at to now() on every edit — created_at stays the original
// timestamp, updated_at shows when it was last touched, so a day's entry
// that gets checked on again later in the day has a visible record of that.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { author_id, note_date, appetite, condition, temperature_c, notes } = body;

  const update = { updated_at: new Date().toISOString() };
  if (author_id !== undefined) update.author_id = author_id || null;
  if (note_date !== undefined) update.note_date = note_date;
  if (appetite !== undefined) update.appetite = appetite || null;
  if (condition !== undefined) update.condition = condition || null;
  if (temperature_c !== undefined) {
    update.temperature_c = temperature_c !== '' ? Number(temperature_c) : null;
  }
  if (notes !== undefined) update.notes = notes || null;

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
