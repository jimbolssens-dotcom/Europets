// app/api/policies/route.js
// GET  /api/policies?category_id=X  -> list policies (optionally filtered to one category)
// POST /api/policies                -> add a policy

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get('category_id');

  let query = supabase
    .from('policies')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });

  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { category_id, title, content, sort_order } = body;

  if (!category_id || !title) {
    return NextResponse.json({ error: 'category_id and title are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('policies')
    .insert([{ category_id, title, content: content || '', sort_order: sort_order ?? 0 }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
