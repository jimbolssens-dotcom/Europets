// app/api/treatment-items/route.js
// GET  /api/treatment-items?visit_id=X            -> planned treatment for a consult
// GET  /api/treatment-items?hospitalization_id=X   -> items logged during a hospitalization stay
// POST /api/treatment-items                        -> add an item from the catalog, to one or
//                                                       the other (exactly one is required)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visit_id');
  const hospitalizationId = searchParams.get('hospitalization_id');

  if (!visitId && !hospitalizationId) {
    return NextResponse.json({ error: 'visit_id or hospitalization_id is required' }, { status: 400 });
  }

  let query = supabase
    .from('treatment_items')
    .select('*, goods_services(name, category, pricing_type, unit, base_price)')
    .order('created_at', { ascending: true });
  query = visitId ? query.eq('visit_id', visitId) : query.eq('hospitalization_id', hospitalizationId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { visit_id, hospitalization_id, goods_service_id, instructions, quantity } = body;

  if (!goods_service_id) {
    return NextResponse.json({ error: 'goods_service_id is required' }, { status: 400 });
  }
  if (!visit_id && !hospitalization_id) {
    return NextResponse.json(
      { error: 'visit_id or hospitalization_id is required' },
      { status: 400 }
    );
  }
  if (visit_id && hospitalization_id) {
    return NextResponse.json(
      { error: 'an item belongs to a visit or a hospitalization, not both' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('treatment_items')
    .insert([
      {
        visit_id: visit_id || null,
        hospitalization_id: hospitalization_id || null,
        goods_service_id,
        instructions: instructions || null,
        quantity: quantity !== undefined && quantity !== '' ? Number(quantity) : 1,
      },
    ])
    .select('*, goods_services(name, category, pricing_type, unit, base_price)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
