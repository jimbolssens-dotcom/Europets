// app/api/hospitalizations/[id]/plan-items/route.js
// GET  /api/hospitalizations/:id/plan-items  -> this admission's Day
//        Treatment Plan tasks (the tap-to-log buttons)
// POST /api/hospitalizations/:id/plan-items  -> add a task to the plan —
//        goods_service_id set for a catalog-linked task (meds/services),
//        left out for routine care (cage cleaning, feeding, checks, ...)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('hospitalization_plan_items')
    .select('*, goods_services(name)')
    .eq('hospitalization_id', params.id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request, { params }) {
  const body = await request.json();
  const { label, goods_service_id, instructions } = body;

  if (!label) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('hospitalization_plan_items')
    .insert([
      {
        hospitalization_id: params.id,
        label,
        goods_service_id: goods_service_id || null,
        instructions: instructions || null,
      },
    ])
    .select('*, goods_services(name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
