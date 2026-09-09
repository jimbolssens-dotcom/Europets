// app/api/xray-reports/[id]/generate-report/route.js
// POST -> generate the AI client report from this report's own manually
// typed fields (findings/notes) — the same generation a dictation
// triggers (see lib/recordingProcessing.js), for a report added by hand
// instead. Overwrites ai_summary.

import { NextResponse } from 'next/server';
import { generateReportFromManualEntry } from '@/lib/manualReportGeneration';

export async function POST(request, { params }) {
  try {
    const data = await generateReportFromManualEntry('xray_report', params.id);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
