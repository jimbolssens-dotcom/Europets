// app/api/goods-services/[id]/route.js
// PATCH /api/goods-services/:id  -> update price/active/etc on a catalog item

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const EDITABLE_FIELDS = ['name', 'category', 'pricing_type', 'base_price', 'unit', 'active'];

export async function PATCH(request, { params }) {
  const body = await request.json();
  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
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
