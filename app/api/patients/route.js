// app/api/patients/route.js
// GET  /api/patients             -> list all patients, with owner (client) info
// GET  /api/patients?client_id=X -> list patients for one client
// POST /api/patients             -> create a new patient (linked to a client)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');

  let query = supabase
    .from('patients')
    .select('*, clients(full_name, phone)')  // join owner info
    .order('name', { ascending: true });

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { client_id, name, species, breed, date_of_birth, sex, current_weight_kg } = body;

  if (!client_id || !name || !species) {
    return NextResponse.json(
      { error: 'client_id, name, and species are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('patients')
    .insert([{ client_id, name, species, breed, date_of_birth, sex, current_weight_kg }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
