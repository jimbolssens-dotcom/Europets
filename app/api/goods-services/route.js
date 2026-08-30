// app/api/goods-services/route.js
// GET  /api/goods-services?category=X&active=true  -> list catalog items
// POST /api/goods-services                          -> add a catalog item

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const PRICING_TYPES = ['flat', 'per_kg', 'per_unit'];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const active = searchParams.get('active');

  let query = supabase.from('goods_services').select('*').order('name', { ascending: true });
  if (category) {
    query = query.eq('category', category);
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
  const { name, category, pricing_type, base_price, unit } = body;

  if (!name || !category || base_price === undefined || base_price === null) {
    return NextResponse.json(
      { error: 'name, category, and base_price are required' },
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

  const { data, error } = await supabase
    .from('goods_services')
    .insert([{ name, category, pricing_type: type, base_price: Number(base_price), unit: unit || null }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
