// app/api/goods-services/[id]/route.js
// PATCH /api/goods-services/:id  -> update name/subcategory/price/active/etc
//        on a catalog item — changing subcategory_id re-derives main_category
//        from the new subcategory, same as on create

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const EDITABLE_FIELDS = ['name', 'subcategory_id', 'pricing_type', 'base_price', 'unit', 'active'];

export async function PATCH(request, { params }) {
  const body = await request.json();
  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  if (update.subcategory_id) {
    const { data: subcategory, error: subcategoryError } = await supabase
      .from('catalog_subcategories')
      .select('main_category')
      .eq('id', update.subcategory_id)
      .single();

    if (subcategoryError || !subcategory) {
      return NextResponse.json({ error: 'invalid subcategory_id' }, { status: 400 });
    }
    update.main_category = subcategory.main_category;
  }

  const { data, error } = await supabase
    .from('goods_services')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
