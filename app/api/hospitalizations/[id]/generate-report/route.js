import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { generateReportForHospitalization } from '@/lib/hospitalizationReportGeneration';

export const maxDuration = 60;

export async function POST(request, { params }) {
  const { data: admission, error } = await supabase.from('hospitalizations').select('*').eq('id', params.id).single();
  if (error || !admission) return NextResponse.json({ error: 'Hospitalization not found' }, { status: 404 });
  try {
    const summary = await generateReportForHospitalization(admission);
    if (!summary) return NextResponse.json({ error: 'Add worksheet notes or test results before generating a hospital report.' }, { status: 400 });
    const { data, error: saveError } = await supabase.from('hospitalizations').update({ ai_summary: summary }).eq('id', params.id).select().single();
    if (saveError) throw new Error(saveError.message);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Could not generate the hospital report.' }, { status: 500 });
  }
}
