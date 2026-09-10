import { supabase } from '@/lib/supabaseClient';
import { summarizeLabAbnormalities } from '@/lib/anthropicClient';
import { isImagingDiagnostic } from '@/lib/diagnosticReportPolicy';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(request, { params }) {
  const { data, error } = await supabase.from('diagnostics')
    .select('result, type, goods_services(name)').eq('id', params.id).single();
  if (error || !data) return NextResponse.json({ error: 'Test not found.' }, { status: 404 });
  if (isImagingDiagnostic(data)) return NextResponse.json({ error: 'Use the veterinarian’s findings for imaging reports.' }, { status: 400 });
  if (!data.result?.trim()) return NextResponse.json({ error: 'Save the laboratory results first.' }, { status: 400 });
  try {
    return NextResponse.json({ summary: await summarizeLabAbnormalities(data.result) });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Could not summarize results.' }, { status: 500 });
  }
}
