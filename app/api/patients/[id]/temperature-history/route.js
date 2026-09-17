// app/api/patients/[id]/temperature-history/route.js
// GET /api/patients/:id/temperature-history -> every temperature reading
// ever recorded for this patient, oldest first, for the lifetime chart on
// the patient page. Same two sources as weight-history: a consult's own
// temperature_c (visits, dated by started_at) and a hospitalization
// worksheet entry's temperature_c (hospitalization_notes, dated by
// created_at — note_date is a bare date with no time-of-day, so same-day
// readings, e.g. a morning and afternoon check, would otherwise collapse
// onto the same x-position and look like a single reading).

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const [{ data: visits, error: visitsError }, { data: hospitalizations, error: hospError }] = await Promise.all([
    supabase
      .from('visits')
      .select('temperature_c, started_at')
      .eq('patient_id', params.id)
      .not('temperature_c', 'is', null),
    supabase.from('hospitalizations').select('id').eq('patient_id', params.id),
  ]);

  if (visitsError) return NextResponse.json({ error: visitsError.message }, { status: 500 });
  if (hospError) return NextResponse.json({ error: hospError.message }, { status: 500 });

  const hospitalizationIds = (hospitalizations || []).map((h) => h.id);
  let notes = [];
  if (hospitalizationIds.length > 0) {
    const { data, error } = await supabase
      .from('hospitalization_notes')
      .select('temperature_c, created_at')
      .in('hospitalization_id', hospitalizationIds)
      .not('temperature_c', 'is', null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    notes = data || [];
  }

  const points = [
    ...(visits || []).map((v) => ({ date: v.started_at, temperature_c: v.temperature_c })),
    ...notes.map((n) => ({ date: n.created_at, temperature_c: n.temperature_c })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  return NextResponse.json(points);
}
