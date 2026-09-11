// app/api/xray-reports/[id]/report-pdf/route.js
// GET /api/xray-reports/:id/report-pdf -> the AI-elaborated x-ray report as
// a PDF — for staff to download/print, or linked directly in the
// WhatsApp/email "send to owner" buttons on the consult page (this route
// needs no auth, same as the other report-pdf routes, since there's no
// staff auth to begin with).

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
    .from('xray_reports')
    .select(
      'ai_summary, performed_at, staff(full_name), visits(patients(name, species, patient_number), clients(full_name, client_number))'
    )
    .eq('id', params.id)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: 'x-ray report not found' }, { status: 404 });
  }

  const [{ data: clinic }, { data: attachments }] = await Promise.all([
    supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
    supabase.from('attachments').select('*').eq('entity_type', 'xray_report').eq('entity_id', params.id),
  ]);

  const imageAttachments = (attachments || []).filter(isImageAttachment).slice(0, MAX_PHOTOS);
  const photos = (await Promise.all(imageAttachments.map(fetchAttachmentBytes))).filter(Boolean);

  const pdfBytes = await buildProcedureReportPdf({
    procedureType: 'xray',
    procedureTitle: 'X-ray Report',
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
      'Content-Disposition': `inline; filename="xray-report-${params.id}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
