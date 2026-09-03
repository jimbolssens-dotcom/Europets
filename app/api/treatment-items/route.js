// app/api/treatment-items/route.js
// GET  /api/treatment-items?visit_id=X                 -> planned treatment for a consult
// GET  /api/treatment-items?hospitalization_note_id=X   -> items logged as part of one
//                                                           worksheet entry
// POST /api/treatment-items                             -> add an item from the catalog, to
//                                                           one or the other (exactly one).
//                                                           If it's a medication with an
//                                                           administration method configured
//                                                           (goods_services.administration_method
//                                                           — dispense/sc/im), that's copied
//                                                           onto the item automatically; it
//                                                           drives an automatic fee line when
//                                                           the treatment plan is invoiced (see
//                                                           lib/invoicing.js). Not something the
//                                                           caller chooses per booking anymore —
//                                                           waiving it is just removing that fee
//                                                           line from the invoice afterward.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

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
  const { visit_id, hospitalization_note_id, goods_service_id, instructions, quantity } = body;

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

  const { data, error } = await supabase
    .from('treatment_items')
    .insert([
      {
        visit_id: visit_id || null,
        hospitalization_note_id: hospitalization_note_id || null,
        goods_service_id,
        instructions: instructions || null,
        quantity: quantity !== undefined && quantity !== '' ? Number(quantity) : 1,
        administration_method: catalogItem.administration_method,
      },
    ])
    .select('*, goods_services(name, main_category, subcategory_id, pricing_type, unit, base_price)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
