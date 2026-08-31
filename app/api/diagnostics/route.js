// app/api/diagnostics/route.js
// GET  /api/diagnostics?visit_id=X  -> list diagnostics for a consult
// POST /api/diagnostics             -> add a diagnostic entry

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const VALID_TYPES = ['blood_test', 'xray', 'ultrasound', 'other'];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visit_id');

  if (!visitId) {
    return NextResponse.json({ error: 'visit_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('diagnostics')
    .select('*')
    .eq('visit_id', visitId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { visit_id, type, description, result } = body;

  if (!visit_id || !type) {
    return NextResponse.json({ error: 'visit_id and type are required' }, { status: 400 });
  }
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `type must be one of ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('diagnostics')
    .insert([{ visit_id, type, description: description || null, result: result || null }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
