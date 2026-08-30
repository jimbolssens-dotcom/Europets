// app/api/consult-notes/route.js
// GET  /api/consult-notes?visit_id=X  -> list notes for a visit, oldest first
// POST /api/consult-notes             -> add a note to a visit

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visit_id');

  if (!visitId) {
    return NextResponse.json({ error: 'visit_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('consult_notes')
    .select('*, staff(full_name)')
    .eq('visit_id', visitId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { visit_id, author_id, note_text } = body;

  if (!visit_id || !note_text) {
    return NextResponse.json({ error: 'visit_id and note_text are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('consult_notes')
    .insert([{ visit_id, author_id: author_id || null, note_text }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
