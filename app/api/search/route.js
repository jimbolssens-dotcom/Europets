// app/api/search/route.js
// GET /api/search?q=...&limit=N&type=client|patient  -> clients and/or
// patients matching the query against name, phone (clients), breed, and
// microchip number (patients). `type` restricts the search to just one
// side (skipping the other table's query entirely) — used by
// SingleTypeSearch's dedicated client-only/patient-only search fields;
// omit it for the combined client+patient search (SearchBox,
// ClientOrPatientSearch).

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
  const type = searchParams.get('type'); // 'client' | 'patient' | null (both)
  const wantClients = type !== 'patient';
  const wantPatients = type !== 'client';

  if (!q) {
    return NextResponse.json({ clients: [], patients: [] });
  }

  const term = `%${q}%`;

  const [clientsResult, patientsResult] = await Promise.all([
    wantClients
      ? (async () => {
          const extraPhoneClientIds = await clientIdsWithPhoneLike(supabase, term);
          const clientOrFilter =
            extraPhoneClientIds.length > 0
              ? `full_name.ilike.${term},phone.ilike.${term},id.in.(${extraPhoneClientIds.join(',')})`
              : `full_name.ilike.${term},phone.ilike.${term}`;
          return supabase.from('clients').select('*').or(clientOrFilter).order('full_name', { ascending: true }).limit(limit);
        })()
      : { data: [] },
    wantPatients
      ? supabase
          .from('patients')
          .select('*, clients(id, full_name, phone, client_number)')
          .or(`name.ilike.${term},breed.ilike.${term},microchip_number.ilike.${term}`)
          .order('name', { ascending: true })
          .limit(limit)
      : { data: [] },
  ]);

  if (clientsResult.error || patientsResult.error) {
    return NextResponse.json({ error: (clientsResult.error || patientsResult.error).message }, { status: 500 });
  }

  return NextResponse.json({ clients: clientsResult.data || [], patients: patientsResult.data || [] });
}
