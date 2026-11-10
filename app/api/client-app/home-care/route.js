// app/api/client-app/home-care/route.js
// The client app's home care (lib/homeCare.js, migration 247), for the
// logged-in client's own pets only (lib/clientAppAuth.js).
//
// GET ?patient_id=  -> { plans (running now), ticks, logs (what they logged,
//                        newest first), nextVisit } for one pet
// GET (no patient)  -> { pets: [{ id, name, patient_number, photo, plans,
//                        dosesLeft, todayLines }] } every pet with home
//                        care running today: the "Today" list for owners
//                        with many pets.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getClientSession } from '@/lib/clientAppAuth';
import { dubaiDateISO } from '@/lib/dayProcedureSchedule';
import { dosesLeft, todayChecklist } from '@/lib/homeCare';
import { nextVisit, ownedPatient, recentPlans, ticksForPlans } from '@/lib/homeCareServer';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const clientId = await getClientSession(request);
  if (!clientId) return NextResponse.json({ error: 'not logged in' }, { status: 401 });
  const patientId = new URL(request.url).searchParams.get('patient_id');
  const today = dubaiDateISO();

  try {
    if (patientId) {
      const pet = await ownedPatient(supabaseAdmin, clientId, patientId);
      if (!pet) return NextResponse.json({ error: 'not your pet' }, { status: 403 });
      const plans = await recentPlans(supabaseAdmin, [patientId]);
      const [ticks, { data: logs }, next] = await Promise.all([
        ticksForPlans(supabaseAdmin, plans.map((p) => p.id)),
        supabaseAdmin.from('home_care_logs').select('*').eq('patient_id', patientId).order('given_at', { ascending: false }).limit(30),
        nextVisit(supabaseAdmin, patientId),
      ]);
      return NextResponse.json({ today, plans, ticks, logs: logs || [], nextVisit: next });
    }

    const { data: pets, error } = await supabaseAdmin
      .from('patients')
      .select('id, name, patient_number, profile_photo_url, species, deceased, rehomed')
      .eq('client_id', clientId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const live = (pets || []).filter((p) => !p.deceased && !p.rehomed);
    const plans = await recentPlans(supabaseAdmin, live.map((p) => p.id));
    const ticks = await ticksForPlans(supabaseAdmin, plans.map((p) => p.id));
    const out = [];
    for (const pet of live) {
      const own = plans.filter((p) => p.patient_id === pet.id);
      if (!own.length) continue;
      const rows = own.flatMap((p) => todayChecklist(p, ticks, today));
      out.push({
        id: pet.id,
        name: pet.name,
        patient_number: pet.patient_number,
        profile_photo_url: pet.profile_photo_url,
        species: pet.species,
        dosesLeft: own.reduce((n, p) => n + dosesLeft(p, ticks, today), 0),
        todayLines: rows.map((r) => r.item.name || r.item.text),
      });
    }
    out.sort((a, b) => b.dosesLeft - a.dosesLeft || a.name.localeCompare(b.name));
    return NextResponse.json({ today, pets: out });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
