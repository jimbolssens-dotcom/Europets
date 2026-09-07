// app/api/policies/[id]/route.js
// GET    /api/policies/:id  -> a single policy
// PATCH  /api/policies/:id  -> edit title/content/category/sort_order
// DELETE /api/policies/:id  -> remove a policy

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const EDITABLE_FIELDS = ['category_id', 'title', 'content', 'sort_order'];

export async function GET(request, { params }) {
  const { data, error } = await supabase.from('policies').select('*').eq('id', params.id).single();

  if (error) {
    return NextResponse.json({ error: 'policy not found' }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('policies')
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
  const { error } = await supabase.from('policies').delete().eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
