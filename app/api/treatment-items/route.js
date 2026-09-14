// app/api/treatment-items/route.js
// GET  /api/treatment-items?visit_id=X                 -> planned treatment for a consult
// GET  /api/treatment-items?hospitalization_note_id=X   -> items logged as part of one
//                                                           worksheet entry
// POST /api/treatment-items                             -> add an item from the catalog, to
//                                                           one or the other (exactly one).
//                                                           Its administration_method is copied
//                                                           straight from the catalog item's own
//                                                           fixed classification (goods_services
//                                                           .administration_method — see
//                                                           migration 095), which drives an
//                                                           automatic fee line when the treatment
//                                                           plan is invoiced (see
//                                                           lib/invoicing.js) — waiving it is
//                                                           just removing that fee line from the
//                                                           invoice afterward. billable defaults
//                                                           to true; pass false to log it on the
//                                                           plan as a clinical record without it
//                                                           ever turning into an invoice charge
//                                                           (see migration 096) — e.g. the owner
//                                                           already has this medication at home.
//                                                           Adding an item to a consult (visit_id)
//                                                           also checks whether it's already
//                                                           mentioned in that consult's own
//                                                           "Treatment plan notes" narrative (the
//                                                           text that actually carries into the
//                                                           consult notes/report) and appends a
//                                                           short line if not — best-effort, never
//                                                           blocks the item being added.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { resolveAdministrationMethod } from '@/lib/administrationMethods';
import { checkTreatmentNoteCoverage } from '@/lib/anthropicClient';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visit_id');
  const hospitalizationNoteId = searchParams.get('hospitalization_note_id');

  if (!visitId && !hospitalizationNoteId) {
    return NextResponse.json(
      { error: 'visit_id or hospitalization_note_id is required' },
      { status: 400 }
    );
  }

  let query = supabase
    .from('treatment_items')
    .select('*, goods_services(name, main_category, subcategory_id, pricing_type, unit, base_price)')
    .order('created_at', { ascending: true });
  query = visitId ? query.eq('visit_id', visitId) : query.eq('hospitalization_note_id', hospitalizationNoteId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { visit_id, hospitalization_note_id, goods_service_id, instructions, quantity, billable } = body;

  if (!goods_service_id) {
    return NextResponse.json({ error: 'goods_service_id is required' }, { status: 400 });
  }
  if (!visit_id && !hospitalization_note_id) {
    return NextResponse.json(
      { error: 'visit_id or hospitalization_note_id is required' },
      { status: 400 }
    );
  }
  if (visit_id && hospitalization_note_id) {
    return NextResponse.json(
      { error: 'an item belongs to a visit or a worksheet entry, not both' },
      { status: 400 }
    );
  }

  const { data: catalogItem, error: catalogError } = await supabase
    .from('goods_services')
    .select('administration_method')
    .eq('id', goods_service_id)
    .single();

  if (catalogError || !catalogItem) {
    return NextResponse.json({ error: 'goods/service not found' }, { status: 400 });
  }

  const resolved = resolveAdministrationMethod(catalogItem.administration_method);

  const { data, error } = await supabase
    .from('treatment_items')
    .insert([
      {
        visit_id: visit_id || null,
        hospitalization_note_id: hospitalization_note_id || null,
        goods_service_id,
        instructions: instructions || null,
        quantity: quantity !== undefined && quantity !== '' ? Number(quantity) : 1,
        administration_method: resolved.administration_method,
        billable: billable === false ? false : true,
      },
    ])
    .select('*, goods_services(name, main_category, subcategory_id, pricing_type, unit, base_price)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (visit_id) {
    await syncTreatmentPlanNotes(visit_id, data.goods_services?.name, data.instructions);
  }

  return NextResponse.json(data, { status: 201 });
}

// Best-effort: keeps the Vitals & Exam "Treatment plan notes" narrative in
// sync with what actually lands on the treatment plan list, since that
// narrative — not the list itself — is what carries into the consult
// notes/report. Never blocks or fails the item add itself; a missed AI
// call just leaves the vet's own narrative exactly as it was before this
// existed.
async function syncTreatmentPlanNotes(visitId, itemName, instructions) {
  if (!itemName) return;
  try {
    const { data: visit } = await supabase.from('visits').select('treatment_notes').eq('id', visitId).single();
    const currentNotes = visit?.treatment_notes || '';

    const { already_covered, note_addition } = await checkTreatmentNoteCoverage(currentNotes, itemName, instructions);
    if (already_covered || !note_addition) return;

    const updatedNotes = currentNotes.trim() ? `${currentNotes}\n${note_addition}` : note_addition;
    await supabase.from('visits').update({ treatment_notes: updatedNotes }).eq('id', visitId);
  } catch (err) {
    console.error('Failed to sync treatment plan notes for visit', visitId, err);
  }
}
