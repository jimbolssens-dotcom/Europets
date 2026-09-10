import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { data, error } = await supabase.from('hospitalization_test_reports')
    .select('*').eq('hospitalization_id', params.id).order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request, { params }) {
  const body = await request.json();
  const reportType = body.report_type;
  if (!['blood', 'ultrasound', 'xray', 'mri', 'pcr', 'dental', 'surgical'].includes(reportType)) return NextResponse.json({ error: 'Choose a supported report type.' }, { status: 400 });
  const { data, error } = await supabase.from('hospitalization_test_reports')
    .insert({ hospitalization_id: params.id, report_type: reportType, source_text: body.source_text || null, result_text: body.result_text || null })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
