// app/api/diagnostics/[id]/route.js
// PATCH  /api/diagnostics/:id  -> update a diagnostic's result/description
//        — a test is usually ordered before its result comes back, so this
//        is how staff fill it in once the lab/imaging result is ready
// DELETE /api/diagnostics/:id  -> remove a diagnostic entry — also removes
//        its linked treatment_items line, if any, so a deleted test
//        doesn't linger as a billable item nobody remembers adding

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const EDITABLE_FIELDS = ['description', 'result'];

export async function PATCH(request, { params }) {
  const body = await request.json();
  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field] || null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('diagnostics')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { data: diagnostic } = await supabase
    .from('diagnostics')
    .select('treatment_item_id')
    .eq('id', params.id)
    .single();

  const { error } = await supabase.from('diagnostics').delete().eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (diagnostic?.treatment_item_id) {
    await supabase.from('treatment_items').delete().eq('id', diagnostic.treatment_item_id);
  }

  return NextResponse.json({ ok: true });
}
