// app/api/home-care/route.js
// Staff only. The Home care card on a consult, day procedure or hospital
// stay (app/_components/HomeCareCard.jsx, lib/homeCare.js, migration 247).
//
// GET ?visit_id= | ?hospitalization_id=
//   -> { plan (saved, or null), suggestedMeds (the record's dispensed
//        medicines as plan lines), nextVisit, patientId }
// PUT { visit_id | hospitalization_id, items }
//   -> saves the plan (starts today the first time); no items deletes it.
// Shown to the owner in the client app only.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { dubaiDateISO } from '@/lib/dayProcedureSchedule';
import { cleanItems, medsFromTreatmentItems } from '@/lib/homeCare';
import { dispensedItems, nextVisit, recordContext } from '@/lib/homeCareServer';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function recordFilter(visitId, hospitalizationId) {
  return visitId ? ['visit_id', visitId] : ['hospitalization_id', hospitalizationId];
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visit_id');
  const hospitalizationId = searchParams.get('hospitalization_id');
  if (!visitId && !hospitalizationId) return NextResponse.json({ error: 'visit_id or hospitalization_id is required' }, { status: 400 });
  try {
    const ctx = await recordContext(supabaseAdmin, { visitId, hospitalizationId });
    if (!ctx) return NextResponse.json({ error: 'record not found' }, { status: 404 });
    const [col, val] = recordFilter(visitId, hospitalizationId);
    const [{ data: plan, error }, dispensed, next] = await Promise.all([
      supabaseAdmin.from('home_care_plans').select('*').eq(col, val).maybeSingle(),
      dispensedItems(supabaseAdmin, { visitId, hospitalizationId }),
      nextVisit(supabaseAdmin, ctx.patientId),
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ plan: plan || null, suggestedMeds: medsFromTreatmentItems(dispensed), nextVisit: next, patientId: ctx.patientId });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request) {
  const body = await request.json().catch(() => ({}));
  const visitId = body.visit_id || null;
  const hospitalizationId = visitId ? null : body.hospitalization_id || null;
  if (!visitId && !hospitalizationId) return NextResponse.json({ error: 'visit_id or hospitalization_id is required' }, { status: 400 });
  try {
    const ctx = await recordContext(supabaseAdmin, { visitId, hospitalizationId });
    if (!ctx) return NextResponse.json({ error: 'record not found' }, { status: 404 });
    const [col, val] = recordFilter(visitId, hospitalizationId);
    const items = cleanItems(body.items);
    const { data: existing } = await supabaseAdmin.from('home_care_plans').select('id, starts_on').eq(col, val).maybeSingle();

    if (items.length === 0) {
      if (existing) await supabaseAdmin.from('home_care_plans').delete().eq('id', existing.id);
      return NextResponse.json({ plan: null });
    }
    const row = { items, updated_at: new Date().toISOString(), patient_id: ctx.patientId, client_id: ctx.clientId };
    const { data, error } = existing
      ? await supabaseAdmin.from('home_care_plans').update(row).eq('id', existing.id).select('*').single()
      : await supabaseAdmin
          .from('home_care_plans')
          .insert([{ ...row, visit_id: visitId, hospitalization_id: hospitalizationId, starts_on: dubaiDateISO() }])
          .select('*')
          .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ plan: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
