// app/api/vaccine-protocols/route.js
// GET  /api/vaccine-protocols?species=cat&active=true  -> list the catalog
// POST /api/vaccine-protocols                          -> add a protocol

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const species = searchParams.get('species');
  const active = searchParams.get('active');

  let query = supabase
    .from('vaccine_protocols')
    .select('*')
    .order('species', { ascending: true })
    .order('name', { ascending: true });

  if (species) {
    query = query.eq('species', species);
  }
  if (active !== null) {
    query = query.eq('active', active === 'true');
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { name, species, core, interval_months } = body;

  if (!name || !species) {
    return NextResponse.json({ error: 'name and species are required' }, { status: 400 });
  }
  if (!['cat', 'dog'].includes(species)) {
    return NextResponse.json({ error: "species must be 'cat' or 'dog'" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('vaccine_protocols')
    .insert([
      {
        name,
        species,
        core: core !== undefined ? Boolean(core) : true,
        interval_months: interval_months ? Number(interval_months) : 12,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
