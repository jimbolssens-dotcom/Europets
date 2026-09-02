// app/api/catalog-subcategories/route.js
// GET  /api/catalog-subcategories?main_category=X&active=true  -> the
//        editable subdivisions under one of the three fixed main categories
// POST /api/catalog-subcategories  -> add one

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const MAIN_CATEGORIES = ['product', 'test', 'service'];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mainCategory = searchParams.get('main_category');
  const active = searchParams.get('active');

  let query = supabase
    .from('catalog_subcategories')
    .select('*')
    .order('main_category', { ascending: true })
    .order('name', { ascending: true });

  if (mainCategory) {
    query = query.eq('main_category', mainCategory);
  }
  if (active !== null) {
    query = query.eq('active', active === 'true');
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { main_category, name } = body;

  if (!main_category || !name) {
    return NextResponse.json({ error: 'main_category and name are required' }, { status: 400 });
  }
  if (!MAIN_CATEGORIES.includes(main_category)) {
    return NextResponse.json(
      { error: `main_category must be one of ${MAIN_CATEGORIES.join(', ')}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('catalog_subcategories')
    .insert([{ main_category, name }])
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
  return NextResponse.json(data, { status: 201 });
}
