// app/api/diagnostics/route.js
// GET  /api/diagnostics?visit_id=X  -> list diagnostics for a consult
// POST /api/diagnostics             -> order a test from the catalog —
//        automatically adds a matching treatment_items line too (see
//        treatment_item_id), so it flows straight into the treatment
//        plan and invoice without a separate manual step

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visit_id');

  if (!visitId) {
    return NextResponse.json({ error: 'visit_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('diagnostics')
    .select('*')
    .eq('visit_id', visitId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { visit_id, goods_service_id, description, result } = body;

  if (!visit_id || !goods_service_id) {
    return NextResponse.json({ error: 'visit_id and goods_service_id are required' }, { status: 400 });
  }

  const { data: catalogItem, error: catalogError } = await supabase
    .from('goods_services')
    .select('main_category')
    .eq('id', goods_service_id)
    .single();
  if (catalogError || !catalogItem) {
    return NextResponse.json({ error: 'invalid goods_service_id' }, { status: 400 });
  }
  if (catalogItem.main_category !== 'test') {
    return NextResponse.json({ error: 'goods_service_id must be a Test catalog item' }, { status: 400 });
  }

  const { data: treatmentItem, error: treatmentItemError } = await supabase
    .from('treatment_items')
    .insert([{ visit_id, goods_service_id, instructions: description || null, quantity: 1 }])
    .select()
    .single();
  if (treatmentItemError) {
    return NextResponse.json({ error: treatmentItemError.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('diagnostics')
    .insert([
      {
        visit_id,
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
