// app/api/surgical-reports/[id]/report-pdf/route.js
// GET /api/surgical-reports/:id/report-pdf -> the client report (what was
// done + home-care instructions, drafted by generateClientReport) plus
// any photos attached to the report, as a PDF — for staff to download/
// print, or linked directly in the WhatsApp/email "send to owner"
// buttons on the consult page (this route needs no auth, same as the
// rest of this app's PDF routes, since there's no staff auth to begin
// with).

import { supabase } from '@/lib/supabaseClient';
import { buildProcedureReportPdf } from '@/lib/procedureReportPdf';
import { isImageAttachment, fetchAttachmentBytes } from '@/lib/pdfAttachments';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Keeps the PDF (and this request) from ballooning if a report has a lot of photos.
const MAX_PHOTOS = 12;

export async function GET(request, { params }) {
  const { data: report, error } = await supabase
    .from('surgical_reports')
    .select(
      'procedure_name, ai_summary, performed_at, staff(full_name), visits(patients(name, species), clients(full_name))'
    )
    .eq('id', params.id)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: 'surgical report not found' }, { status: 404 });
  }

  const [{ data: clinic }, { data: attachments }] = await Promise.all([
    supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
    supabase.from('attachments').select('*').eq('entity_type', 'surgical_report').eq('entity_id', params.id),
  ]);

  const imageAttachments = (attachments || []).filter(isImageAttachment).slice(0, MAX_PHOTOS);
  const photos = (await Promise.all(imageAttachments.map(fetchAttachmentBytes))).filter(Boolean);

  const pdfBytes = await buildProcedureReportPdf({
    procedureType: 'surgical',
    procedureTitle: report.procedure_name ? `Surgical Report — ${report.procedure_name}` : undefined,
    patient: report.visits?.patients,
    client: report.visits?.clients,
    clinic,
    performedAt: report.performed_at,
    staffName: report.staff?.full_name,
    sections: [{ text: report.ai_summary }],
    photos,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="surgical-report-${params.id}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
