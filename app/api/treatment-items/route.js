// app/api/treatment-items/route.js
// GET  /api/treatment-items?visit_id=X  -> list planned treatment for a consult
// POST /api/treatment-items             -> add a planned treatment item from the catalog

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visit_id');

  if (!visitId) {
    return NextResponse.json({ error: 'visit_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('treatment_items')
    .select('*, goods_services(name, category, pricing_type, unit)')
    .eq('visit_id', visitId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { visit_id, goods_service_id, instructions, quantity } = body;

  if (!visit_id || !goods_service_id) {
    return NextResponse.json(
      { error: 'visit_id and goods_service_id are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('treatment_items')
    .insert([
      {
        visit_id,
        goods_service_id,
        instructions: instructions || null,
        quantity: quantity !== undefined && quantity !== '' ? Number(quantity) : 1,
      },
    ])
    .select('*, goods_services(name, category, pricing_type, unit)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
