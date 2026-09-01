// app/api/intake-requests/route.js
// GET  /api/intake-requests  -> list every intake request, newest first,
//                                for the staff Intake review page
// POST /api/intake-requests  -> generate a new blank intake link to send a
//                                prospective client (nothing filled in yet),
//                                optionally recording the number it's sent to

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

export async function POST(request) {
  const body = await request.json().catch(() => ({}));

  const { data, error } = await supabase
    .from('intake_requests')
    .insert([{ sent_to_phone: body.sent_to_phone || null }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
