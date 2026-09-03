// app/api/goods-services/route.js
// GET  /api/goods-services?main_category=X&subcategory_id=Y&active=true
//        -> list catalog items
// POST /api/goods-services -> add a catalog item, filed under a subcategory
//        (which fixes its main_category — product/test/service — for you)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const PRICING_TYPES = ['flat', 'per_kg', 'per_unit'];
const ADMINISTRATION_METHODS = ['dispense', 'sc', 'im'];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mainCategory = searchParams.get('main_category');
  const subcategoryId = searchParams.get('subcategory_id');
  const active = searchParams.get('active');

  let query = supabase.from('goods_services').select('*').order('name', { ascending: true });
  if (mainCategory) {
    query = query.eq('main_category', mainCategory);
  }
  if (subcategoryId) {
    query = query.eq('subcategory_id', subcategoryId);
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
  const { name, subcategory_id, pricing_type, base_price, unit, administration_method } = body;

  if (!name || !subcategory_id || base_price === undefined || base_price === null) {
    return NextResponse.json(
      { error: 'name, subcategory_id, and base_price are required' },
      { status: 400 }
    );
  }
  const type = pricing_type || 'flat';
  if (!PRICING_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `pricing_type must be one of ${PRICING_TYPES.join(', ')}` },
      { status: 400 }
    );
  }
  if (Number.isNaN(Number(base_price)) || Number(base_price) < 0) {
    return NextResponse.json({ error: 'base_price must be a non-negative number' }, { status: 400 });
  }
  if (administration_method && !ADMINISTRATION_METHODS.includes(administration_method)) {
    return NextResponse.json(
      { error: `administration_method must be one of ${ADMINISTRATION_METHODS.join(', ')}` },
      { status: 400 }
    );
  }

  const { data: subcategory, error: subcategoryError } = await supabase
    .from('catalog_subcategories')
    .select('main_category')
    .eq('id', subcategory_id)
    .single();

  if (subcategoryError || !subcategory) {
    return NextResponse.json({ error: 'invalid subcategory_id' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('goods_services')
    .insert([
      {
        name,
        main_category: subcategory.main_category,
        subcategory_id,
        pricing_type: type,
        base_price: Number(base_price),
        unit: unit || null,
        administration_method: administration_method || null,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
