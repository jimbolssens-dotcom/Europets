// app/api/patients/[id]/weight-history/route.js
// GET /api/patients/:id/weight-history -> every weight this patient ever
// had recorded against it, oldest first, for the lifetime weight chart on
// the patient page. Pulled from both places a weight actually gets typed
// in: a consult's own weight_kg (visits, dated by started_at) and a
// hospitalization worksheet entry's weight_kg (hospitalization_notes,
// dated by created_at — note_date is a bare date with no time-of-day, so
// two same-day readings would otherwise land on the same x-position and
// look like just one) — a pet with a long admission and no consults in
// between would otherwise show a gap.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const [{ data: visits, error: visitsError }, { data: hospitalizations, error: hospError }] = await Promise.all([
    supabase.from('visits').select('weight_kg, started_at').eq('patient_id', params.id).not('weight_kg', 'is', null),
    supabase.from('hospitalizations').select('id').eq('patient_id', params.id),
  ]);

  if (visitsError) return NextResponse.json({ error: visitsError.message }, { status: 500 });
  if (hospError) return NextResponse.json({ error: hospError.message }, { status: 500 });

  const hospitalizationIds = (hospitalizations || []).map((h) => h.id);
  let notes = [];
  if (hospitalizationIds.length > 0) {
    const { data, error } = await supabase
      .from('hospitalization_notes')
      .select('weight_kg, created_at')
      .in('hospitalization_id', hospitalizationIds)
      .not('weight_kg', 'is', null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    notes = data || [];
  }

  const points = [
    ...(visits || []).map((v) => ({ date: v.started_at, weight_kg: v.weight_kg })),
    ...notes.map((n) => ({ date: n.created_at, weight_kg: n.weight_kg })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  return NextResponse.json(points);
}
