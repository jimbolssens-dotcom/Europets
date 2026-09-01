// app/api/clients/route.js
// GET  /api/clients        -> list all clients (used by dropdowns elsewhere)
// GET  /api/clients?name=&phone=&email=&address=&client_number=&emirates_id=
//                           -> filtered by any combination of those (all optional,
//                              AND'ed together) — used by the Clients page search
// POST /api/clients        -> create a new client

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');
  const phone = searchParams.get('phone');
  const email = searchParams.get('email');
  const address = searchParams.get('address');
  const clientNumber = searchParams.get('client_number');
  const emiratesId = searchParams.get('emirates_id');

  let query = supabase.from('clients').select('*').order('full_name', { ascending: true });

  if (name) query = query.ilike('full_name', `%${name}%`);
  if (phone) query = query.or(`phone.ilike.%${phone}%,phone2.ilike.%${phone}%`);
  if (email) query = query.ilike('email', `%${email}%`);
  if (address) query = query.ilike('address', `%${address}%`);
  if (emiratesId) query = query.ilike('emirates_id', `%${emiratesId}%`);
  if (clientNumber && !Number.isNaN(Number(clientNumber))) {
    query = query.eq('client_number', Number(clientNumber));
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { full_name, phone, phone2, phone2_label, emirates_id, trn, email, address } = body;

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
        emirates_id: emirates_id || null,
        trn: trn || null,
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
