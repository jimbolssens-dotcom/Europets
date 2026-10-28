// app/api/stock/[id]/route.js
// PATCH { reorder_level?, active? } -> change a stock item (migration 229).
// active: false stops tracking it (the Stock page's Remove): it stops
// counting down and leaves the list, its history kept for a re-add.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const update = {};
  if (body.reorder_level !== undefined) {
    const n = Number(body.reorder_level);
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'The reorder level must be 0 or more' }, { status: 400 });
    update.reorder_level = n;
  }
  if (body.active !== undefined) update.active = !!body.active;
  if (!Object.keys(update).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
  const { data, error } = await supabaseAdmin.from('stock_items').update(update).eq('id', params.id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
