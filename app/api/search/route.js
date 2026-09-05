// app/api/search/route.js
// GET /api/search?q=...&limit=N  -> clients and patients matching the query
// against name, phone (clients), breed, and microchip number (patients).

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { clientIdsWithPhoneLike } from '@/lib/phoneMatch';

// PostgREST's .or() filter syntax uses commas/parens as delimiters — strip
// them out of the raw search term so a stray character can't break the query.
function sanitize(q) {
  return q.replace(/[,()]/g, ' ').trim();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = sanitize(searchParams.get('q') || '');
  const limit = Math.min(Number(searchParams.get('limit')) || 8, 50);

  if (!q) {
    return NextResponse.json({ clients: [], patients: [] });
  }

  const term = `%${q}%`;

  let extraPhoneClientIds;
  try {
    extraPhoneClientIds = await clientIdsWithPhoneLike(supabase, term);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  const clientOrFilter =
    extraPhoneClientIds.length > 0
      ? `full_name.ilike.${term},phone.ilike.${term},id.in.(${extraPhoneClientIds.join(',')})`
      : `full_name.ilike.${term},phone.ilike.${term}`;

  const [{ data: clients, error: clientsError }, { data: patients, error: patientsError }] =
    await Promise.all([
      supabase.from('clients').select('*').or(clientOrFilter).order('full_name', { ascending: true }).limit(limit),
      supabase
        .from('patients')
        .select('*, clients(id, full_name, phone)')
        .or(`name.ilike.${term},breed.ilike.${term},microchip_number.ilike.${term}`)
        .order('name', { ascending: true })
        .limit(limit),
    ]);

  if (clientsError || patientsError) {
    return NextResponse.json({ error: (clientsError || patientsError).message }, { status: 500 });
  }

  return NextResponse.json({ clients: clients || [], patients: patients || [] });
}
