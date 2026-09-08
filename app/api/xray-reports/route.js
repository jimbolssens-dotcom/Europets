// app/api/xray-reports/route.js
// GET  /api/xray-reports?visit_id=X  -> list x-ray reports for a consult
// GET  /api/xray-reports             -> every SAVED report clinic-wide (ai_summary set —
//                                       an empty "Dictate Report" shell doesn't count),
//                                       newest first, for the Imaging Reports page
//                                       (app/(admin)/imaging-reports/page.jsx)
// POST /api/xray-reports             -> add an x-ray report, tied to
//                                       the diagnostic entry it's for

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visit_id');

  if (visitId) {
    const { data, error } = await supabase
      .from('xray_reports')
      .select('*, staff(full_name)')
      .eq('visit_id', visitId)
      .order('performed_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from('xray_reports')
    .select('*, staff(full_name), visits(patients(id, name, species), clients(id, full_name))')
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
  const { visit_id, diagnostic_id, performed_by, findings, notes } = body;

  if (!visit_id) {
    return NextResponse.json({ error: 'visit_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('xray_reports')
    .insert([
      {
        visit_id,
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
