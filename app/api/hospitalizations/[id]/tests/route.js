// app/api/hospitalizations/[id]/tests/route.js
// GET /api/hospitalizations/:id/tests -> every test for this stay (see
// lib/stayDiagnostics.js: the stay's own plus the admitting consult's), in
// the shape the client portal lists: name, date and recorded result. Each
// test's images/files are read separately through AttachmentGallery
// (entity_type 'diagnostic'), and the whole lot downloads as one PDF from
// ./test-report-pdf.
//
// Public (GET-only, see HOSPITALIZATION_READ_PATTERNS in middleware.js),
// same carve-out as this stay's /notes, /messages and /reports.

import { supabase } from '@/lib/supabaseClient';
import { loadStayDiagnostics, diagnosticLabel } from '@/lib/stayDiagnostics';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data, error, originatingVisitId } = await loadStayDiagnostics(supabase, params.id);
  if (error) return NextResponse.json({ error: 'Could not load tests.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'admission not found' }, { status: 404 });

  return NextResponse.json({
    originating_visit_id: originatingVisitId || null,
    tests: data.map((d) => ({
      id: d.id,
      label: diagnosticLabel(d),
      result: d.result?.trim() || null,
      created_at: d.created_at,
    })),
  });
}
