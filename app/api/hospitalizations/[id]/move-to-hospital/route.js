// app/api/hospitalizations/[id]/move-to-hospital/route.js
// POST -> "Move to Hospital" for a day procedure (Jim, 18 Nov). Instead of
// turning the day procedure itself into the admission, it:
//   1. starts a NEW hospital stay for the patient (or uses the one already
//      open), with the usual temperature/weight boxes, today's vitals
//      carried over and the hospitalisation consent form sent;
//   2. links the day procedure to it (originating_hospitalization_id), so
//      the stay page shows the day procedure's own invoice with "Merge into
//      the hospitalization";
//   3. completes the day procedure (no discharge follow-up: the pet is
//      staying in);
//   4. writes ONE worksheet entry on the stay for the whole day procedure
//      (lib/dayProcedureSummary.js), billing nothing again.
// Returns { id } of the stay to open.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { seedVitalsFromOrigin } from '@/lib/hospitalizationVitalsSync';
import { createConsentFormRequest } from '@/lib/consentForms';
import { dayProcedureSummary } from '@/lib/dayProcedureSummary';
import { uaeDate } from '@/lib/wallPlanItems';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { data: dp, error } = await supabase
    .from('hospitalizations')
    .select('id, kind, status, patient_id, client_id, reason, admitted_at, originating_hospitalization_id')
    .eq('id', params.id)
    .maybeSingle();
  if (error || !dp) return NextResponse.json({ error: 'day procedure not found' }, { status: 404 });
  if (dp.kind !== 'day_procedure') return NextResponse.json({ error: 'This is already a hospital stay.' }, { status: 400 });

  // The stay it goes to: the one it was booked from, or another stay of
  // this patient's that's still open, or a new one.
  let stayId = null;
  const { data: open } = await supabase
    .from('hospitalizations')
    .select('id')
    .eq('patient_id', dp.patient_id)
    .eq('kind', 'admission')
    .eq('status', 'admitted')
    .order('admitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) stayId = open.id;

  if (!stayId) {
    const { data: stay, error: createError } = await supabaseAdmin
      .from('hospitalizations')
      .insert([{ patient_id: dp.patient_id, client_id: dp.client_id, reason: dp.reason || null, kind: 'admission' }])
      .select('id')
      .single();
    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
    stayId = stay.id;
    await supabaseAdmin.from('hospitalization_plan_items').insert([
      { hospitalization_id: stayId, label: 'Temperature', kind: 'vitals_temperature' },
      { hospitalization_id: stayId, label: 'Weight', kind: 'vitals_weight' },
    ]);
    await seedVitalsFromOrigin(stayId, dp.id).catch(() => {});
    await createConsentFormRequest({ hospitalizationId: stayId, formType: 'hospitalization' }).catch(() => {});
  }

  // Linked to the stay, and completed. Not through the usual discharge:
  // that would schedule a "how is she doing at home" follow-up.
  const { error: linkError } = await supabaseAdmin
    .from('hospitalizations')
    .update({
      originating_hospitalization_id: stayId,
      ...(dp.status === 'admitted' ? { status: 'discharged', discharged_at: new Date().toISOString() } : {}),
    })
    .eq('id', dp.id);
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });

  // One entry on the stay for the whole day procedure.
  const { data: notes } = await supabase
    .from('hospitalization_notes')
    .select('notes, created_at, treatment_items(goods_services(name))')
    .eq('hospitalization_id', dp.id);
  const dateLabel = new Date(dp.admitted_at || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' });
  await supabaseAdmin.from('hospitalization_notes').insert([
    {
      hospitalization_id: stayId,
      author_id: body.author_id || null,
      note_date: uaeDate(),
      notes: dayProcedureSummary(notes || [], { dateLabel }),
    },
  ]);

  return NextResponse.json({ id: stayId, dayProcedureId: dp.id });
}
