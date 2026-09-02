// app/api/catalog-subcategories/[id]/route.js
// PATCH  /api/catalog-subcategories/:id  -> rename/deactivate a subcategory
// DELETE /api/catalog-subcategories/:id  -> remove one (blocked if used)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const MAIN_CATEGORIES = ['product', 'test', 'service'];
const EDITABLE_FIELDS = ['name', 'main_category', 'active'];

export async function PATCH(request, { params }) {
  const body = await request.json();
  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field];
  }

  if (update.main_category && !MAIN_CATEGORIES.includes(update.main_category)) {
    return NextResponse.json(
      { error: `main_category must be one of ${MAIN_CATEGORIES.join(', ')}` },
      { status: 400 }
    );
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('catalog_subcategories')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'a subcategory with this name already exists under this main category' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // goods_services.main_category is a denormalized copy of its
  // subcategory's, kept for cheap filtering without a join — re-point
  // every item under this subcategory if its main category just moved.
  if (update.main_category) {
    const { error: cascadeError } = await supabase
      .from('goods_services')
      .update({ main_category: update.main_category })
      .eq('subcategory_id', params.id);
    if (cascadeError) {
      return NextResponse.json({ error: cascadeError.message }, { status: 500 });
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { error } = await supabase.from('catalog_subcategories').delete().eq('id', params.id);

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        {
          error:
            'cannot delete this subcategory — it has catalog items assigned to it; deactivate it instead',
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
