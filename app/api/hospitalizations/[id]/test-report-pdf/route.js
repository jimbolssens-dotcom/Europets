// app/api/hospitalizations/[id]/test-report-pdf/route.js
// GET /api/hospitalizations/:id/test-report-pdf -> a PDF of this
// admission's diagnostic test results (bloodwork, PCR panels, ...) — one
// section per test ordered during this stay or on the consult it was
// admitted from (see lib/stayDiagnostics.js), mirroring
// /api/visits/:id/test-report-pdf for a consult. Public — no staff
// login — same carve-out as the other report-pdf routes (see
// middleware.js).

import { supabase } from '@/lib/supabaseClient';
import { buildProcedureReportPdf } from '@/lib/procedureReportPdf';
import { loadStayDiagnostics, diagnosticLabel } from '@/lib/stayDiagnostics';
import { isImageAttachment, isPdfAttachment, fetchAttachmentBytes, attachedLabReportText, appendPdfAttachments } from '@/lib/pdfAttachments';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
// Keeps the PDF (and this request) from ballooning if a lot of test photos
// are still attached (normally most get cleared right after extraction).
const MAX_PHOTOS = 12;

export async function GET(request, { params }) {
  const { data: admission, error } = await supabase
    .from('hospitalizations')
    .select('admitted_at, patients(name, species, patient_number), clients(full_name, client_number)')
    .eq('id', params.id)
    .single();

  if (error || !admission) {
    return NextResponse.json({ error: 'admission not found' }, { status: 404 });
  }

  const [{ data: clinic }, { data: diagnostics, error: diagnosticError }] = await Promise.all([
    supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
    loadStayDiagnostics(supabase, params.id),
  ]);
  if (diagnosticError) return NextResponse.json({ error: 'Could not load test results.' }, { status: 500 });

  const diagIds = (diagnostics || []).map((d) => d.id);
  const { data: attachments } = diagIds.length
    ? await supabase.from('attachments').select('*').eq('entity_type', 'diagnostic').in('entity_id', diagIds)
    : { data: [] };
  const imageAttachments = (attachments || []).filter(isImageAttachment).slice(0, MAX_PHOTOS);
  const photos = (await Promise.all(imageAttachments.map(fetchAttachmentBytes))).filter(Boolean);

  // A lab result attached as a PDF (not typed in) is added to the end of
  // this report, and its section points to it instead of "No result".
  const labPdfs = (attachments || []).filter(isPdfAttachment);
  const sections = (diagnostics || []).map((d) => {
    const files = labPdfs.filter((a) => a.entity_id === d.id);
    return {
      label: diagnosticLabel(d),
      text: [d.result, files.length ? attachedLabReportText(files) : null].filter(Boolean).join('\n\n') || 'No result recorded yet.',
    };
  });

  const pdfBytes = await buildProcedureReportPdf({
    procedureTitle: 'Test Results Report',
    patient: admission.patients,
    client: admission.clients,
    clinic,
    performedAt: admission.admitted_at,
    sections,
    photos,
  });
  const fullPdf = await appendPdfAttachments(pdfBytes, labPdfs);

  return new NextResponse(Buffer.from(fullPdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="test-results-${params.id}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
