// app/api/hospitalizations/[id]/owner-informed/route.js
// Staff only. POST { staff_id, how } -> the owner of a patient that passed
// away in hospital has been told (migration 261). Clears the alarm, and
// only now marks the pet deceased (which also stops reminders) and closes
// the stay, with the date it passed away, without the usual "how is she
// doing at home" follow-up.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { INFORMED_HOW } from '@/lib/passedAway';
import { runHospitalizationDischargeEffects } from '@/lib/hospitalizationDischarge';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  if (!body.staff_id) return NextResponse.json({ error: 'Choose who told the owner.' }, { status: 400 });
  if (!INFORMED_HOW.some((h) => h.value === body.how)) return NextResponse.json({ error: 'Choose how the owner was told.' }, { status: 400 });

  const { data: stay, error } = await supabaseAdmin
    .from('hospitalizations')
    .select('id, status, patient_id, passed_away_at, owner_informed_at')
    .eq('id', params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!stay?.passed_away_at) return NextResponse.json({ error: 'This patient is not marked as passed away.' }, { status: 409 });
  if (stay.owner_informed_at) return NextResponse.json({ ok: true, already: true });

  // Deceased first, so closing the stay below never schedules the "how is
  // she at home" follow-up (lib/dischargeFollowups.js skips a deceased pet).
  await supabaseAdmin.from('patients').update({ deceased: true, rehomed: false }).eq('id', stay.patient_id);

  const update = { owner_informed_at: new Date().toISOString(), owner_informed_by: body.staff_id, owner_informed_how: body.how };
  const closing = stay.status === 'admitted';
  if (closing) Object.assign(update, { status: 'discharged', discharged_at: stay.passed_away_at });
  const { error: updateError } = await supabaseAdmin.from('hospitalizations').update(update).eq('id', stay.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (closing) await runHospitalizationDischargeEffects(supabaseAdmin, stay.id).catch(() => {});
  await supabaseAdmin.from('discharge_followups').update({ status: 'skipped' }).eq('hospitalization_id', stay.id).in('status', ['scheduled', 'ready_for_review']);
  return NextResponse.json({ ok: true });
}
