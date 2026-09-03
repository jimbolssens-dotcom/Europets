// app/api/dental-reports/[id]/report-pdf/route.js
// GET /api/dental-reports/:id/report-pdf -> the client report (what was
// done — including the dental chart's extractions — + home-care
// instructions, drafted by generateClientReport) plus any photos
// attached to the report, as a PDF — for staff to download/print, or
// linked directly in the WhatsApp/email "send to owner" buttons on the
// consult page (this route needs no auth, same as the rest of this
// app's PDF routes, since there's no staff auth to begin with).
//
// Generating this PDF is also what locks this visit's extracted teeth
// to "missing" on the patient's permanent chart (see lockExtractedTeeth)
// — the chart image drawn into THIS pdfBytes still shows them extracted
// (built from the pre-lock state), so the very report documenting the
// extraction is the last one to show it that way; any later report or
// the patient record itself reads it as a plain missing tooth from here
// on. (Completing the consult does the same thing, as a fallback for
// extractions marked without ever generating this PDF.)

import { supabase } from '@/lib/supabaseClient';
import { buildProcedureReportPdf } from '@/lib/procedureReportPdf';
import { isImageAttachment, fetchAttachmentBytes } from '@/lib/pdfAttachments';
import { lockExtractedTeeth } from '@/lib/dentalChartLayout';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Keeps the PDF (and this request) from ballooning if a report has a lot of photos.
const MAX_PHOTOS = 12;

export async function GET(request, { params }) {
  const { data: report, error } = await supabase
    .from('dental_reports')
    .select(
      'ai_summary, performed_at, staff(full_name), visits(patients(id, name, species, dental_chart), clients(full_name))'
    )
    .eq('id', params.id)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: 'dental report not found' }, { status: 404 });
  }

  const [{ data: clinic }, { data: attachments }] = await Promise.all([
    supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
    supabase.from('attachments').select('*').eq('entity_type', 'dental_report').eq('entity_id', params.id),
  ]);

  const imageAttachments = (attachments || []).filter(isImageAttachment).slice(0, MAX_PHOTOS);
  const photos = (await Promise.all(imageAttachments.map(fetchAttachmentBytes))).filter(Boolean);

  const patient = report.visits?.patients;

  const pdfBytes = await buildProcedureReportPdf({
    procedureType: 'dental',
    patient,
    client: report.visits?.clients,
    clinic,
    performedAt: report.performed_at,
    staffName: report.staff?.full_name,
    dentalChart: patient?.dental_chart,
    sections: [{ text: report.ai_summary }],
    photos,
  });

  if (patient) {
    const locked = lockExtractedTeeth(patient.dental_chart);
    if (locked && JSON.stringify(locked) !== JSON.stringify(patient.dental_chart)) {
      await supabase.from('patients').update({ dental_chart: locked }).eq('id', patient.id);
    }
  }

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="dental-report-${params.id}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
