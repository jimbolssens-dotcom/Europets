// app/api/hospitalizations/[id]/notes/route.js
// GET  /api/hospitalizations/:id/notes  -> the day-to-day worksheet
// POST /api/hospitalizations/:id/notes  -> add a day's entry

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('hospitalization_notes')
    .select('*, staff(full_name)')
    .eq('hospitalization_id', params.id)
    .order('note_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request, { params }) {
  const body = await request.json();
  const { author_id, note_date, appetite, condition, temperature_c, notes } = body;

  const { data, error } = await supabase
    .from('hospitalization_notes')
    .insert([
      {
        hospitalization_id: params.id,
        author_id: author_id || null,
        note_date: note_date || new Date().toISOString().slice(0, 10),
        appetite: appetite || null,
        condition: condition || null,
        temperature_c: temperature_c !== undefined && temperature_c !== '' ? Number(temperature_c) : null,
        notes: notes || null,
      },
    ])
    .select('*, staff(full_name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
