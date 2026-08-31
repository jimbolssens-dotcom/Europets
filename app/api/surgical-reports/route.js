// app/api/surgical-reports/route.js
// GET  /api/surgical-reports?visit_id=X  -> list surgical reports for a consult
// POST /api/surgical-reports             -> add a surgical report

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visit_id');

  if (!visitId) {
    return NextResponse.json({ error: 'visit_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('surgical_reports')
    .select('*, staff(full_name)')
    .eq('visit_id', visitId)
    .order('performed_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { visit_id, surgeon_id, procedure_name, notes } = body;

  if (!visit_id) {
    return NextResponse.json({ error: 'visit_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('surgical_reports')
    .insert([
      {
        visit_id,
        surgeon_id: surgeon_id || null,
        procedure_name: procedure_name || null,
        notes: notes || null,
      },
    ])
    .select('*, staff(full_name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
