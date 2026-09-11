// app/api/diagnostics/route.js
// GET  /api/diagnostics?visit_id=X | ?hospitalization_id=X  -> list
//        diagnostics for a consult, or for a hospitalization
// POST /api/diagnostics  -> order a test from the catalog, for a consult
//        (visit_id) or a hospitalization (hospitalization_id) — either
//        way this automatically adds a matching treatment_items line
//        too, so it flows straight into the treatment plan/day worksheet
//        and invoice without a separate manual step. For a
//        hospitalization there's no consult record to log it against, so
//        a hospitalization_notes worksheet entry is created to carry the
//        treatment_items line, the same way DayTreatmentPlan logs meds.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visit_id');
  const hospitalizationId = searchParams.get('hospitalization_id');

  if (!visitId && !hospitalizationId) {
    return NextResponse.json({ error: 'visit_id or hospitalization_id is required' }, { status: 400 });
  }

  let query = supabase.from('diagnostics').select('*').order('created_at', { ascending: true });
  query = visitId ? query.eq('visit_id', visitId) : query.eq('hospitalization_id', hospitalizationId);
  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { visit_id, hospitalization_id, goods_service_id, description, result } = body;

  if (!goods_service_id) {
    return NextResponse.json({ error: 'goods_service_id is required' }, { status: 400 });
  }
  if (!visit_id && !hospitalization_id) {
    return NextResponse.json({ error: 'visit_id or hospitalization_id is required' }, { status: 400 });
  }
  if (visit_id && hospitalization_id) {
    return NextResponse.json({ error: 'a test belongs to a consult or a hospitalization, not both' }, { status: 400 });
  }

  const { data: catalogItem, error: catalogError } = await supabase
    .from('goods_services')
    .select('main_category, name')
    .eq('id', goods_service_id)
    .single();
  if (catalogError || !catalogItem) {
    return NextResponse.json({ error: 'invalid goods_service_id' }, { status: 400 });
  }
  if (catalogItem.main_category !== 'test') {
    return NextResponse.json({ error: 'goods_service_id must be a Test catalog item' }, { status: 400 });
  }

  // A consult's treatment_items line hangs straight off the visit; a
  // hospitalization's billable items hang off a specific day's worksheet
  // entry (see migration 019) — so ordering a test during a stay first
  // creates that entry, the same way DayTreatmentPlan logs a medication.
  let hospitalizationNoteId = null;
  if (hospitalization_id) {
    const { data: note, error: noteError } = await supabase
      .from('hospitalization_notes')
      .insert([{ hospitalization_id, notes: `Test ordered: ${catalogItem.name}` }])
      .select('id')
      .single();
    if (noteError) {
      return NextResponse.json({ error: noteError.message }, { status: 500 });
    }
    hospitalizationNoteId = note.id;
  }

  const { data: treatmentItem, error: treatmentItemError } = await supabase
    .from('treatment_items')
    .insert([
      {
        visit_id: visit_id || null,
        hospitalization_note_id: hospitalizationNoteId,
        goods_service_id,
        instructions: description || null,
        quantity: 1,
      },
    ])
    .select()
    .single();
  if (treatmentItemError) {
    return NextResponse.json({ error: treatmentItemError.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('diagnostics')
    .insert([
      {
        visit_id: visit_id || null,
        hospitalization_id: hospitalization_id || null,
        goods_service_id,
        treatment_item_id: treatmentItem.id,
        description: description || null,
        result: result || null,
      },
    ])
    .select()
    .single();

  if (error) {
    // Roll back the treatment item we just created — there's no
    // cross-table transaction here, so this stays a clean retry instead
    // of leaving a stray, unexplained line on the treatment plan.
    await supabase.from('treatment_items').delete().eq('id', treatmentItem.id);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
