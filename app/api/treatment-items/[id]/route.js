// app/api/treatment-items/[id]/route.js
// PATCH  /api/treatment-items/:id  -> edit an existing item's instructions/
//                                      quantity — e.g. from the hospitalization
//                                      worksheet's day-level medication log
//                                      (app/(admin)/hospitalization/[id]).
//                                      Not which goods/service it is or which
//                                      entry it belongs to — that's a
//                                      remove-and-re-add, not an edit.
// DELETE /api/treatment-items/:id  -> remove a planned treatment item

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function PATCH(request, { params }) {
  const body = await request.json();
  const update = {};
  if (body.instructions !== undefined) update.instructions = body.instructions === '' ? null : body.instructions;
  if (body.quantity !== undefined) update.quantity = body.quantity === '' ? 1 : Number(body.quantity);

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('treatment_items')
    .update(update)
    .eq('id', params.id)
    .select('*, goods_services(name, main_category, subcategory_id, pricing_type, unit, base_price)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { error } = await supabase.from('treatment_items').delete().eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
