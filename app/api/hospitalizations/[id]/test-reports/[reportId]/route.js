import { supabase } from '@/lib/supabaseClient';
import { generateClientReport, generateUltrasoundReport, generateXrayReport, summarizeLabAbnormalities } from '@/lib/anthropicClient';
import { NextResponse } from 'next/server';

export async function PATCH(request, { params }) {
  const body = await request.json();
  const update = {};
  for (const field of ['source_text', 'result_text', 'ai_summary']) if (body[field] !== undefined) update[field] = body[field] || null;
  if (!Object.keys(update).length) return NextResponse.json({ error: 'No editable fields provided.' }, { status: 400 });
  const { data, error } = await supabase.from('hospitalization_test_reports').update(update)
    .eq('id', params.reportId).eq('hospitalization_id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request, { params }) {
  const { data: report, error } = await supabase.from('hospitalization_test_reports').select('*, hospitalizations(patients(name, species))')
    .eq('id', params.reportId).eq('hospitalization_id', params.id).single();
  if (error || !report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  const text = (report.source_text || report.result_text || '').trim();
  if (!text) return NextResponse.json({ error: 'Add the veterinarian’s findings or saved result first.' }, { status: 400 });
  try {
    const patient = report.hospitalizations?.patients;
    const summary = report.report_type === 'blood'
      ? await summarizeLabAbnormalities(text)
      : report.report_type === 'ultrasound'
        ? await generateUltrasoundReport({ transcript: text, patientName: patient?.name, species: patient?.species })
        : report.report_type === 'xray'
          ? await generateXrayReport({ transcript: text, patientName: patient?.name, species: patient?.species })
          : await generateClientReport({ procedureType: report.report_type, transcript: text, patientName: patient?.name, species: patient?.species });
    const { data, error: saveError } = await supabase.from('hospitalization_test_reports').update({ ai_summary: summary })
      .eq('id', params.reportId).eq('hospitalization_id', params.id).select().single();
    if (saveError) throw saveError;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Could not generate report.' }, { status: 500 });
  }
}
