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
    .order('created_at', { ascending: true });

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
  const { author_id, note_date, appetite, condition, temperature_c, weight_kg, notes, treatment_items } = body;

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
      },
    ])
    .select('*, staff(full_name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let insertedItems = [];
  const pendingItems = (Array.isArray(treatment_items) ? treatment_items : []).filter((t) => t.goods_service_id);

  // A medication's administration method (and its fee) is applied
  // automatically from its catalog entry, not chosen per booking — look
  // up whichever items are being added here so it can be copied onto
  // each row (see lib/invoicing.js for where the fee itself gets added).
  let methodByGoodsServiceId = {};
  if (pendingItems.length > 0) {
    const { data: catalogItems } = await supabase
      .from('goods_services')
      .select('id, administration_method')
      .in('id', [...new Set(pendingItems.map((t) => t.goods_service_id))]);
    methodByGoodsServiceId = Object.fromEntries((catalogItems || []).map((c) => [c.id, c.administration_method]));
  }

  const itemRows = pendingItems.map((t) => ({
    hospitalization_note_id: note.id,
    goods_service_id: t.goods_service_id,
    instructions: t.instructions || null,
    quantity: t.quantity !== undefined && t.quantity !== '' ? Number(t.quantity) : 1,
    administration_method: methodByGoodsServiceId[t.goods_service_id] || null,
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
