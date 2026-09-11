// app/api/xray-reports/route.js
// GET  /api/xray-reports?visit_id=X | ?hospitalization_id=X  -> list
//        x-ray reports for a consult, or for a hospitalization
// GET  /api/xray-reports             -> every SAVED report clinic-wide (ai_summary set —
//                                       an empty "Dictate Report" shell doesn't count),
//                                       newest first, for the Imaging Reports page
//                                       (app/(admin)/imaging-reports/page.jsx)
// POST /api/xray-reports             -> add an x-ray report, tied to
//                                       the diagnostic entry it's for, for a
//                                       consult or a hospitalization (exactly one)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visit_id');
  const hospitalizationId = searchParams.get('hospitalization_id');

  if (visitId || hospitalizationId) {
    let query = supabase.from('xray_reports').select('*, staff(full_name)').order('performed_at', { ascending: true });
    query = visitId ? query.eq('visit_id', visitId) : query.eq('hospitalization_id', hospitalizationId);
    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from('xray_reports')
    .select(
      '*, staff(full_name), visits(patients(id, name, species), clients(id, full_name)), hospitalizations(patients(id, name, species), clients(id, full_name))'
    )
    .not('ai_summary', 'is', null)
    .order('performed_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { visit_id, hospitalization_id, diagnostic_id, performed_by, findings, notes } = body;

  if (!visit_id && !hospitalization_id) {
    return NextResponse.json({ error: 'visit_id or hospitalization_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('xray_reports')
    .insert([
      {
        visit_id: visit_id || null,
        hospitalization_id: hospitalization_id || null,
        diagnostic_id: diagnostic_id || null,
        performed_by: performed_by || null,
        findings: findings || null,
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
