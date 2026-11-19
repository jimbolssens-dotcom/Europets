// app/api/gastroscopy-reports/route.js
// GET  /api/gastroscopy-reports?visit_id=X | ?hospitalization_id=X  -> list
//        gastroscopy reports for a consult, or for a hospitalization
// GET  /api/gastroscopy-reports      -> every SAVED report clinic-wide (ai_summary set —
//                                       an empty "Dictate Report" shell doesn't count),
//                                       newest first, for the Imaging Reports page
//                                       (app/(admin)/imaging-reports/page.jsx)
// POST /api/gastroscopy-reports      -> add a gastroscopy report, tied to
//                                       the diagnostic entry it's for, for a
//                                       consult or a hospitalization (exactly one)

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visit_id');
  const hospitalizationId = searchParams.get('hospitalization_id');

  if (visitId || hospitalizationId) {
    let query = supabase.from('gastroscopy_reports').select('*, staff(full_name)').order('performed_at', { ascending: true });
    query = visitId ? query.eq('visit_id', visitId) : query.eq('hospitalization_id', hospitalizationId);
    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from('gastroscopy_reports')
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

  // The scan's report usually exists already (migration 256 makes it with
  // the test): hand that one back, with anything typed filled in, rather
  // than starting a second report for the same scan.
  if (diagnostic_id) {
    const { data: existing } = await supabase.from('gastroscopy_reports').select('id').eq('diagnostic_id', diagnostic_id).limit(1).maybeSingle();
    if (existing) {
      const update = {};
      if (performed_by) update.performed_by = performed_by;
      if (findings) update.findings = findings;
      if (notes) update.notes = notes;
      const query = Object.keys(update).length
        ? supabaseAdmin.from('gastroscopy_reports').update(update).eq('id', existing.id)
        : supabase.from('gastroscopy_reports').select('*, staff(full_name)').eq('id', existing.id);
      const { data: kept, error: keptError } = Object.keys(update).length
        ? await query.select('*, staff(full_name)').single()
        : await query.single();
      if (keptError) return NextResponse.json({ error: keptError.message }, { status: 500 });
      return NextResponse.json(kept, { status: 200 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from('gastroscopy_reports')
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
