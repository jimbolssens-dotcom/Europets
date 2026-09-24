// app/api/hospitalizations/[id]/reports/route.js
// GET /api/hospitalizations/:id/reports -> every dental/surgical/
// ultrasound/x-ray/gastroscopy report logged against this hospitalization,
// in the shape the client portal needs: an id (for that report's own photo
// gallery — see AttachmentSection's entityType convention) and whichever
// text is actually meant for the owner to read. Never the clinical
// findings/notes/performed_by fields — those stay staff-only.
//
// Public (GET-only — see HOSPITALIZATION_READ_PATTERNS in middleware.js),
// same carve-out as this hospitalization's own /notes and /messages routes.
//
// Dental/surgical reports have no separate client-facing field — their
// ai_summary is already written in plain, owner-facing language (see
// ClientReportEditor's use of it in app/_components/RecordReports.jsx) —
// so that's what's returned for those two. Ultrasound/x-ray/gastroscopy
// reports keep their clinical ai_summary internal and only ever return
// client_summary, the second AI pass written specifically for the owner
// (see generateClientSummaryFromScanReport in lib/anthropicClient.js) —
// and only once staff has actually generated it, not the clinical draft.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const REPORT_SOURCES = [
  { table: 'dental_reports', label: 'Dental report', textField: 'ai_summary' },
  { table: 'surgical_reports', label: 'Surgical report', textField: 'ai_summary' },
  { table: 'ultrasound_reports', label: 'Ultrasound report', textField: 'client_summary' },
  { table: 'xray_reports', label: 'X-ray report', textField: 'client_summary' },
  { table: 'gastroscopy_reports', label: 'Gastroscopy report', textField: 'client_summary' },
];

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const results = await Promise.all(
    REPORT_SOURCES.map(({ table, textField }) =>
      supabase.from(table).select(`id, performed_at, ${textField}`).eq('hospitalization_id', params.id)
    )
  );

  for (const result of results) {
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  const reports = REPORT_SOURCES.flatMap(({ table, label, textField }, i) =>
    (results[i].data || [])
      .filter((row) => row[textField]?.trim())
      .map((row) => ({
        id: row.id,
        entityType: table.slice(0, -1), // 'dental_reports' -> 'dental_report'
        label,
        text: row[textField],
        performed_at: row.performed_at,
      }))
  );

  reports.sort((a, b) => new Date(a.performed_at) - new Date(b.performed_at));

  return NextResponse.json(reports);
}
