import { supabase } from '@/lib/supabaseClient';
import { buildProcedureReportPdf } from '@/lib/procedureReportPdf';
import { isImageAttachment, fetchAttachmentBytes } from '@/lib/pdfAttachments';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_PHOTOS = 12;
const TYPE_LABELS = {
  blood: 'Blood Test Report',
  ultrasound: 'Ultrasound Report',
  xray: 'X-ray Report',
  pcr: 'PCR Report',
  dental: 'Dental Report',
  surgical: 'Surgical Report',
};

export async function GET(request, { params }) {
  const { data: report, error } = await supabase
    .from('hospitalization_test_reports')
    .select('id, report_type, ai_summary, source_text, result_text, created_at, hospitalizations(patients(name, species), clients(full_name))')
    .eq('id', params.reportId)
    .eq('hospitalization_id', params.id)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: 'report not found' }, { status: 404 });
  }

  const [{ data: clinic }, { data: attachments }] = await Promise.all([
    supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
    supabase.from('attachments').select('*').eq('entity_type', 'hospitalization_test_report').eq('entity_id', params.reportId),
  ]);

  const imageAttachments = (attachments || []).filter(isImageAttachment).slice(0, MAX_PHOTOS);
  const photos = (await Promise.all(imageAttachments.map(fetchAttachmentBytes))).filter(Boolean);
  const reportText = report.ai_summary || report.result_text || report.source_text || 'No report text recorded.';

  const pdfBytes = await buildProcedureReportPdf({
    procedureType: report.report_type,
    procedureTitle: TYPE_LABELS[report.report_type] || 'Clinical Report',
    patient: report.hospitalizations?.patients,
    client: report.hospitalizations?.clients,
    clinic,
    performedAt: report.created_at,
    sections: [{ text: reportText }],
    photos,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="hospitalization-${report.report_type || 'clinical'}-report-${params.reportId}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
