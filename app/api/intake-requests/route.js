// app/api/intake-requests/route.js
// GET  /api/intake-requests  -> list every intake request, newest first,
//                                for the staff Intake review page
// POST /api/intake-requests  -> generate a new blank intake link to send a
//                                prospective client (nothing filled in yet)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET() {
  const { data, error } = await supabase
    .from('intake_requests')
    .select('*, clients(id, full_name)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST() {
  const { data, error } = await supabase.from('intake_requests').insert([{}]).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
