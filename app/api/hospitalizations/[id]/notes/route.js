// app/api/hospitalizations/[id]/notes/route.js
// GET  /api/hospitalizations/:id/notes  -> the day-to-day worksheet, each
//                                           entry with the medications/
//                                           goods/services logged as part
//                                           of it
// POST /api/hospitalizations/:id/notes  -> add a day's entry, optionally
//                                           with a treatment_items array
//                                           of catalog items given as part
//                                           of that same entry

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { hasCheckinData, buildEmpathicCheckinText } from '@/lib/hospitalizationCheckin';
import { resolveAdministrationMethod } from '@/lib/administrationMethods';

// See app/api/hospitalizations/[id]/route.js — same caching gotcha, and
// this is the route the client portal's Temp/Weight/Appetite fields
// actually come from.
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data: notes, error } = await supabase
    .from('hospitalization_notes')
    .select('*, staff(full_name)')
    .eq('hospitalization_id', params.id)
    .order('note_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const noteIds = notes.map((n) => n.id);
  let itemsByNote = {};
  if (noteIds.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from('treatment_items')
      .select('*, goods_services(name, main_category, subcategory_id, pricing_type, unit, base_price)')
      .in('hospitalization_note_id', noteIds);
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }
    itemsByNote = (items || []).reduce((acc, item) => {
      (acc[item.hospitalization_note_id] ||= []).push(item);
      return acc;
    }, {});
  }

  return NextResponse.json(notes.map((n) => ({ ...n, treatment_items: itemsByNote[n.id] || [] })));
}

export async function POST(request, { params }) {
  const body = await request.json();
  const {
    author_id,
    note_date,
    appetite,
    condition,
    temperature_c,
    weight_kg,
    notes,
    treatment_items,
    stool,
    urine,
    vomit,
    drinking,
    mood,
    temperature_feel,
    medication_given,
    force_feeding_done,
    plan_item_id,
  } = body;

  const checkinFields = { stool, urine, vomit, drinking, mood, temperature_feel, medication_given, force_feeding_done, appetite, temperature_c };
  let clientSummary = null;
  if (hasCheckinData(checkinFields)) {
    const { data: hosp } = await supabase
      .from('hospitalizations')
      .select('patients(name)')
      .eq('id', params.id)
      .single();
    clientSummary = buildEmpathicCheckinText(checkinFields, hosp?.patients?.name);
  }

  const { data: note, error } = await supabase
    .from('hospitalization_notes')
    .insert([
      {
        hospitalization_id: params.id,
        author_id: author_id || null,
        note_date: note_date || new Date().toISOString().slice(0, 10),
        appetite: appetite || null,
        condition: condition || null,
        temperature_c: temperature_c !== undefined && temperature_c !== '' ? Number(temperature_c) : null,
        weight_kg: weight_kg !== undefined && weight_kg !== '' ? Number(weight_kg) : null,
        notes: notes || null,
        // Quick Check-In fields (see lib/hospitalizationCheckin.js) — the
        // cleaner's simplified tile form; null for a normal worksheet entry.
        stool: stool || null,
        urine: urine || null,
        vomit: vomit || null,
        drinking: drinking || null,
        mood: mood || null,
        temperature_feel: temperature_feel || null,
        medication_given: medication_given || null,
        force_feeding_done: force_feeding_done || null,
        // Set when this entry was logged by tapping a Day Treatment Plan
        // button (see DayTreatmentPlan.jsx) rather than typed by hand —
        // lets the plan compute each task's "done today" count/time.
        plan_item_id: plan_item_id || null,
        // Prose version of the fields above, shown to the owner on the
        // portal — generated once here, then staff-editable on the
        // worksheet (app/(admin)/hospitalization/[id]) independently of
        // the structured fields, so an edit always sticks.
        client_summary: clientSummary,
      },
    ])
    .select('*, staff(full_name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // A worksheet entry IS the update the owner was waiting on — clear the
  // "Request an Update" flag (see the request-update route) so that
  // case's cage stops blinking on the Cage Layout page. Best-effort: a
  // failure here shouldn't lose the note that was just saved.
  await supabase
    .from('hospitalizations')
    .update({ update_requested_at: null, update_request_message: null })
    .eq('id', params.id);

  let insertedItems = [];
  const pendingItems = (Array.isArray(treatment_items) ? treatment_items : []).filter((t) => t.goods_service_id);

  // A dispensed medication's method is applied automatically; an
  // injectable one needs whichever route was actually chosen for it
  // (t.administration_method, 'sc' or 'im' — see resolveAdministrationMethod)
  // — look up each item's catalog classification to know which applies.
  let methodByGoodsServiceId = {};
  if (pendingItems.length > 0) {
    const { data: catalogItems } = await supabase
      .from('goods_services')
      .select('id, administration_method')
      .in('id', [...new Set(pendingItems.map((t) => t.goods_service_id))]);
    methodByGoodsServiceId = Object.fromEntries((catalogItems || []).map((c) => [c.id, c.administration_method]));
  }

  const resolvedMethods = pendingItems.map((t) =>
    resolveAdministrationMethod(methodByGoodsServiceId[t.goods_service_id], t.administration_method)
  );
  const firstError = resolvedMethods.find((r) => r.error);
  if (firstError) {
    // The entry itself is already saved — surface the item failure rather
    // than losing the note, same as an actual insert failure below.
    return NextResponse.json({ error: firstError.error }, { status: 400 });
  }

  const itemRows = pendingItems.map((t, i) => ({
    hospitalization_note_id: note.id,
    goods_service_id: t.goods_service_id,
    instructions: t.instructions || null,
    quantity: t.quantity !== undefined && t.quantity !== '' ? Number(t.quantity) : 1,
    administration_method: resolvedMethods[i].administration_method,
  }));

  if (itemRows.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from('treatment_items')
      .insert(itemRows)
      .select('*, goods_services(name, main_category, subcategory_id, pricing_type, unit, base_price)');
    if (itemsError) {
      // The entry itself is already saved — surface the item failure
      // rather than losing the note, since reloading will still show it.
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }
    insertedItems = items;
  }

  return NextResponse.json({ ...note, treatment_items: insertedItems }, { status: 201 });
}
