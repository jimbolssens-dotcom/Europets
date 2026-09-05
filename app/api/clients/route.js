// app/api/clients/route.js
// GET  /api/clients        -> list all clients (used by dropdowns elsewhere)
// GET  /api/clients?name=&phone=&email=&address=&client_number=&emirates_id=
//                           -> filtered by any combination of those (all optional,
//                              AND'ed together) — used by the Clients page search
// POST /api/clients        -> create a new client, with a phones list (see
//                              client_phones — replaces the old phone/phone2 pair)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { clientIdsWithPhoneLike } from '@/lib/phoneMatch';
import { normalizeClientPhones, attachClientPhones } from '@/lib/clientPhones';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');
  const phone = searchParams.get('phone');
  const email = searchParams.get('email');
  const address = searchParams.get('address');
  const clientNumber = searchParams.get('client_number');
  const emiratesId = searchParams.get('emirates_id');

  let query = supabase.from('clients').select('*').order('full_name', { ascending: true });

  if (phone) {
    // A match on the client's synced primary (clients.phone) or any other
    // number they have on file (see client_phones) — combined as one
    // AND'ed clause alongside whatever other filters were given.
    const extraIds = await clientIdsWithPhoneLike(supabase, `%${phone}%`);
    query =
      extraIds.length > 0
        ? query.or(`phone.ilike.%${phone}%,id.in.(${extraIds.join(',')})`)
        : query.ilike('phone', `%${phone}%`);
  }
  if (name) query = query.ilike('full_name', `%${name}%`);
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
  await attachClientPhones(supabase, data);
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { full_name, phones, emirates_id, trn, email, address } = body;

  if (!full_name) {
    return NextResponse.json({ error: 'full_name is required' }, { status: 400 });
  }

  let normalizedPhones;
  try {
    normalizedPhones = normalizeClientPhones(phones);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const { data: client, error } = await supabase
    .from('clients')
    .insert([
      {
        full_name,
        phone: normalizedPhones.find((p) => p.is_whatsapp)?.phone || null,
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

  if (normalizedPhones.length > 0) {
    const { error: phonesError } = await supabase
      .from('client_phones')
      .insert(normalizedPhones.map((p) => ({ ...p, client_id: client.id })));
    if (phonesError) {
      return NextResponse.json({ error: phonesError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ...client, client_phones: normalizedPhones }, { status: 201 });
}
