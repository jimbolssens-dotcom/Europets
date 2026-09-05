// app/api/patients/route.js
// GET  /api/patients             -> list all patients, with owner (client) info
// GET  /api/patients?client_id=X -> list patients for one client
// GET  /api/patients?name=&species=&breed=&microchip=&owner=&patient_number=
//                                 -> filtered by any combination of those (all
//                                    optional, AND'ed together) — used by the
//                                    Patients page search
// POST /api/patients             -> create a new patient (linked to a client)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { seedCoreVaccinationsFromLastGiven } from '@/lib/vaccinationSeeding';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');
  const name = searchParams.get('name');
  const species = searchParams.get('species');
  const breed = searchParams.get('breed');
  const microchip = searchParams.get('microchip');
  const owner = searchParams.get('owner');
  const patientNumber = searchParams.get('patient_number');

  // Filtering on the owner's name requires the join to be an inner join so
  // the foreign-table filter below actually applies.
  let query = supabase
    .from('patients')
    .select(owner ? '*, clients!inner(full_name, phone)' : '*, clients(full_name, phone)')
    .order('name', { ascending: true });

  if (clientId) query = query.eq('client_id', clientId);
  if (name) query = query.ilike('name', `%${name}%`);
  if (species) query = query.ilike('species', `%${species}%`);
  if (breed) query = query.ilike('breed', `%${breed}%`);
  if (microchip) query = query.ilike('microchip_number', `%${microchip}%`);
  if (owner) query = query.ilike('clients.full_name', `%${owner}%`);
  if (patientNumber && !Number.isNaN(Number(patientNumber))) {
    query = query.eq('patient_number', Number(patientNumber));
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const {
    client_id,
    name,
    species,
    breed,
    color,
    date_of_birth,
    sex,
    current_weight_kg,
    microchip_number,
    microchip_implanted_at,
    last_vaccination_date,
  } = body;

  if (!client_id || !name || !species) {
    return NextResponse.json(
      { error: 'client_id, name, and species are required' },
      { status: 400 }
    );
  }
  if (!sex) {
    return NextResponse.json({ error: 'sex is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('patients')
    .insert([
      {
        client_id,
        name,
        species,
        breed,
        color: color || null,
        date_of_birth,
        sex,
        current_weight_kg,
        microchip_number: microchip_number || null,
        microchip_implanted_at: microchip_implanted_at || null,
      },
    ])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'that microchip number is already registered to another patient' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await seedCoreVaccinationsFromLastGiven(supabase, data.id, species, last_vaccination_date);

  return NextResponse.json(data, { status: 201 });
}
