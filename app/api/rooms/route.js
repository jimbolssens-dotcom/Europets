// app/api/rooms/route.js
// GET  /api/rooms   -> list all rooms
// POST /api/rooms   -> create a new room

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET() {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { name, type } = body;

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (type && !['consult', 'surgery'].includes(type)) {
    return NextResponse.json(
      { error: "type must be 'consult' or 'surgery'" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('rooms')
    .insert([{ name, type: type || 'consult' }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
