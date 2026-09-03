// app/api/dental-reports/[id]/generate-postop/route.js
// POST /api/dental-reports/:id/generate-postop -> an AI-drafted, owner-
// facing post-op instructions text for this report, built from the
// clinic's approved dental baseline (Settings) plus this report's own
// findings/procedures/notes/AI summary. Returns the draft only — nothing
// is saved here. The vet reviews/edits it on the consult page and
// PATCHes postop_instructions to /api/dental-reports/:id once they're
// happy with it; only then can it be downloaded/shared.

import { supabase } from '@/lib/supabaseClient';
import { generatePostOpInstructions } from '@/lib/anthropicClient';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(request, { params }) {
  const { data: report, error } = await supabase
    .from('dental_reports')
    .select('findings, procedures_performed, notes, ai_summary, visits(patients(name, species))')
    .eq('id', params.id)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: 'dental report not found' }, { status: 404 });
  }

  const { data: clinic } = await supabase
    .from('clinic_settings')
    .select('dental_postop_baseline')
    .eq('id', true)
    .maybeSingle();

  const caseNotes = [
    report.findings ? `Findings: ${report.findings}` : null,
    report.procedures_performed ? `Procedures performed: ${report.procedures_performed}` : null,
    report.notes,
    report.ai_summary,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const postop_instructions = await generatePostOpInstructions({
      procedureType: 'dental',
      patientName: report.visits?.patients?.name,
      species: report.visits?.patients?.species,
      caseNotes,
      baseline: clinic?.dental_postop_baseline,
    });
    return NextResponse.json({ postop_instructions });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
