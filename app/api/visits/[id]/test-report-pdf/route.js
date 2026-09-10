// app/api/visits/[id]/test-report-pdf/route.js
// GET /api/visits/:id/test-report-pdf -> a PDF of this consult's diagnostic
// test results (bloodwork, PCR panels, ...) — one section per test ordered
// on this visit, each with its catalog name and whatever result text is on
// file (typed by hand, or read from a photo — see POST /api/diagnostics/
// :id/extract-result), plus any test photos not yet cleared out. Built from
// the diagnostics table directly (not visits.test_results, which only ever
// captures the AI-extracted subset) so a manually-typed result is included
// too. For sharing test results with an owner without the rest of the
// consult record. Public — no staff login — same carve-out as the other
// report-pdf routes (see middleware.js).

import { supabase } from '@/lib/supabaseClient';
import { buildProcedureReportPdf } from '@/lib/procedureReportPdf';
import { isImageAttachment, fetchAttachmentBytes } from '@/lib/pdfAttachments';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
// Keeps the PDF (and this request) from ballooning if a lot of test photos
// are still attached (normally most get cleared right after extraction).
const MAX_PHOTOS = 12;

export async function GET(request, { params }) {
  const { data: visit, error } = await supabase
    .from('visits')
    .select('started_at, test_results, patients(name, species), clients(full_name)')
    .eq('id', params.id)
    .single();

  if (error || !visit) {
    return NextResponse.json({ error: 'consult not found' }, { status: 404 });
  }

  const [{ data: clinic }, { data: diagnostics, error: diagnosticError }] = await Promise.all([
    supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
    supabase
      .from('diagnostics')
      .select('*, goods_services(name)')
      .eq('visit_id', params.id)
      .order('created_at', { ascending: true }),
  ]);
  if (diagnosticError) return NextResponse.json({ error: 'Could not load test results.' }, { status: 500 });

  const diagIds = (diagnostics || []).map((d) => d.id);
  const { data: attachments } = diagIds.length
    ? await supabase.from('attachments').select('*').eq('entity_type', 'diagnostic').in('entity_id', diagIds)
    : { data: [] };
  const imageAttachments = (attachments || []).filter(isImageAttachment).slice(0, MAX_PHOTOS);
  const photos = (await Promise.all(imageAttachments.map(fetchAttachmentBytes))).filter(Boolean);

  const sections = (diagnostics || []).map((d) => ({
    label: d.goods_services?.name || d.description || 'Test',
    text: d.result || 'No result recorded yet.',
  }));
  if (visit.test_results?.trim()) sections.unshift({ label: 'Consult test notes', text: visit.test_results });

  const pdfBytes = await buildProcedureReportPdf({
    procedureTitle: 'Test Results Report',
    patient: visit.patients,
    client: visit.clients,
    clinic,
    performedAt: visit.started_at,
    sections,
    photos,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="test-results-${params.id}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
