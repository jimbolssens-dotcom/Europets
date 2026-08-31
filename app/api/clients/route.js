// app/api/clients/route.js
// GET  /api/clients        -> list all clients
// POST /api/clients        -> create a new client

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('full_name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { full_name, phone, phone2, phone2_label, email, address } = body;

  if (!full_name) {
    return NextResponse.json({ error: 'full_name is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('clients')
    .insert([
      {
        full_name,
        phone,
        phone2: phone2 || null,
        phone2_label: phone2 ? phone2_label || null : null,
        email,
        address,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
