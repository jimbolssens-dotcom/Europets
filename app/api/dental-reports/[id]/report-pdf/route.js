// app/api/dental-reports/[id]/report-pdf/route.js
// GET /api/dental-reports/:id/report-pdf -> the client report (what was
// done — including the dental chart's extractions — + home-care
// instructions, drafted by generateClientReport) as a PDF — for staff to
// download/print, or linked directly in the WhatsApp/email "send to
// owner" buttons on the consult page (this route needs no auth, same as
// the rest of this app's PDF routes, since there's no staff auth to
// begin with).

import { supabase } from '@/lib/supabaseClient';
import { buildProcedureReportPdf } from '@/lib/procedureReportPdf';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data: report, error } = await supabase
    .from('dental_reports')
    .select(
      'ai_summary, performed_at, staff(full_name), visits(patients(name, species, dental_chart), clients(full_name))'
    )
    .eq('id', params.id)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: 'dental report not found' }, { status: 404 });
  }

  const { data: clinic } = await supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle();

  const pdfBytes = await buildProcedureReportPdf({
    procedureType: 'dental',
    patient: report.visits?.patients,
    client: report.visits?.clients,
    clinic,
    performedAt: report.performed_at,
    staffName: report.staff?.full_name,
    dentalChart: report.visits?.patients?.dental_chart,
    sections: [{ text: report.ai_summary }],
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="dental-report-${params.id}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
