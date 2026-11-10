// app/api/client-app/reports/route.js
// GET ?limit= -> every report and test for all of the logged-in client's
// pets, newest first, each with petName (lib/patientReportOverview.js's
// patientsReportRows). One request instead of one per pet: an owner with
// hundreds of pets (a rescuer) used to wait about 10 seconds while the
// home screen and Reports tab asked for each pet's reports separately.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getClientSession } from '@/lib/clientAppAuth';
import { patientsReportRows } from '@/lib/patientReportOverview';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const clientId = await getClientSession(request);
  if (!clientId) return NextResponse.json({ error: 'not logged in' }, { status: 401 });
  const limit = Number(new URL(request.url).searchParams.get('limit')) || null;

  const { data: pets, error } = await supabaseAdmin.from('patients').select('id, name').eq('client_id', clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const names = Object.fromEntries((pets || []).map((p) => [p.id, p.name]));
  try {
    const rows = await patientsReportRows(Object.keys(names));
    const withNames = rows.map((r) => ({ ...r, petName: names[r.patient_id] || '' }));
    return NextResponse.json(limit ? withNames.slice(0, limit) : withNames);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
