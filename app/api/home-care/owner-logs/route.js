// app/api/home-care/owner-logs/route.js
// Staff only. GET ?patient_id= -> what the owner logged about this pet in
// the client app (lib/homeCare.js, migration 247), newest first, with the
// home care plans they refer to and how many doses were ticked:
// { logs, plans: [{ ...plan, adherence }], sinceLastVisit, lastVisitAt }.
// sinceLastVisit counts the owner's logs after the pet's last consult or
// stay started; it drives the "📝 Owner logged ..." chip on the headers.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { dubaiDateISO } from '@/lib/dayProcedureSchedule';
import { adherence } from '@/lib/homeCare';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get('patient_id');
  const before = searchParams.get('before'); // a record's own start: count what came before it
  if (!patientId) return NextResponse.json({ error: 'patient_id is required' }, { status: 400 });

  const [{ data: logs, error }, { data: plans }, { data: lastVisit }, { data: lastStay }] = await Promise.all([
    supabaseAdmin.from('home_care_logs').select('*').eq('patient_id', patientId).order('given_at', { ascending: false }).limit(300),
    supabaseAdmin.from('home_care_plans').select('*').eq('patient_id', patientId).order('starts_on', { ascending: false }).limit(20),
    supabaseAdmin.from('visits').select('started_at').eq('patient_id', patientId).lt('started_at', before || new Date().toISOString()).order('started_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('hospitalizations').select('admitted_at').eq('patient_id', patientId).lt('admitted_at', before || new Date().toISOString()).order('admitted_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = dubaiDateISO();
  const lastVisitAt = [lastVisit?.started_at, lastStay?.admitted_at].filter(Boolean).sort().pop() || null;
  const sinceLastVisit = (logs || []).filter((l) => (!lastVisitAt || l.given_at > lastVisitAt) && (!before || l.given_at < before) && l.kind !== 'dose' && l.kind !== 'task').length;
  const ticks = (logs || []).filter((l) => l.kind === 'dose' || l.kind === 'task');
  return NextResponse.json({
    logs: logs || [],
    plans: (plans || []).map((p) => ({ ...p, adherence: adherence(p, ticks, today) })),
    sinceLastVisit,
    lastVisitAt,
  });
}
