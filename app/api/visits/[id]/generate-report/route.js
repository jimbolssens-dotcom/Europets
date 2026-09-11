import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { generateReportForConsult } from '@/lib/consultReportGeneration';

export const maxDuration = 60;

export async function POST(request, { params }) {
  const { data: visit, error } = await supabase.from('visits').select('*').eq('id', params.id).single();
  if (error || !visit) return NextResponse.json({ error: 'Consult not found' }, { status: 404 });
  try {
    const summary = await generateReportForConsult(visit);
    if (!summary) return NextResponse.json({ error: 'Save notes or test results before generating a consult report.' }, { status: 400 });
    const { data, error: saveError } = await supabase.from('visits').update({ ai_summary: summary }).eq('id', params.id).select().single();
    if (saveError) throw new Error(saveError.message);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Could not generate the consult report.' }, { status: 500 });
  }
}
