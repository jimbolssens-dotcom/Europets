// app/api/surgical-reports/route.js
// GET  /api/surgical-reports?visit_id=X | ?hospitalization_id=X  -> list
//        surgical reports for a consult, or for a hospitalization
// POST /api/surgical-reports  -> add a surgical report, for a consult or
//        a hospitalization (exactly one)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visit_id');
  const hospitalizationId = searchParams.get('hospitalization_id');

  if (!visitId && !hospitalizationId) {
    return NextResponse.json({ error: 'visit_id or hospitalization_id is required' }, { status: 400 });
  }

  let query = supabase.from('surgical_reports').select('*, staff(full_name)').order('performed_at', { ascending: true });
  query = visitId ? query.eq('visit_id', visitId) : query.eq('hospitalization_id', hospitalizationId);
  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { visit_id, hospitalization_id, surgeon_id, procedure_name, notes } = body;

  if (!visit_id && !hospitalization_id) {
    return NextResponse.json({ error: 'visit_id or hospitalization_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('surgical_reports')
    .insert([
      {
        visit_id: visit_id || null,
        hospitalization_id: hospitalization_id || null,
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
