import { supabase } from '@/lib/supabaseClient';
import { extractDiagnosticResult } from '@/lib/anthropicClient';
import { NextResponse } from 'next/server';

export const maxDuration = 60;
export async function POST(request, { params }) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'A test document is required.' }, { status: 400 });
  const { data: report, error } = await supabase.from('hospitalization_test_reports').select('report_type, result_text').eq('id', params.reportId).eq('hospitalization_id', params.id).single();
  if (error || !report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (['xray', 'ultrasound'].includes(report.report_type)) return NextResponse.json({ error: 'X-ray and ultrasound images are never interpreted by AI. Save the veterinarian’s findings as text.' }, { status: 400 });
  try {
    const extracted = await extractDiagnosticResult(Buffer.from(await file.arrayBuffer()), file.type || 'image/jpeg', `${report.report_type} test`);
    const result_text = report.result_text?.trim() ? report.result_text.trim() + '\n\n' + extracted : extracted;
    const { data, error: saveError } = await supabase.from('hospitalization_test_reports').update({ result_text }).eq('id', params.reportId).eq('hospitalization_id', params.id).select().single();
    if (saveError) throw saveError;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Could not read the blood-test document.' }, { status: 500 });
  }
}
