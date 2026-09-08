// app/api/visits/[id]/report-pdf/route.js
// GET /api/visits/:id/report-pdf -> a PDF summary of this consult: the
// AI-drafted client report (see generateConsultReport in
// lib/anthropicClient.js), if one's been generated, followed by the full
// record — vitals, exam notes, diagnostics, treatment plan — and any
// photos attached to the consult (see AttachmentSection on the consult
// page), for the vet to download and send to the client, or linked
// directly in the WhatsApp/email "send to owner" buttons on the consult
// page. Public — no staff login — same carve-out as the surgical/dental
// report-pdf routes (see middleware.js).

import { supabase } from '@/lib/supabaseClient';
import { buildConsultReportPdf } from '@/lib/consultReportPdf';
import { isImageAttachment, fetchAttachmentBytes } from '@/lib/pdfAttachments';
import { NextResponse } from 'next/server';

export const maxDuration = 30;
// Keeps the PDF (and this request) from ballooning if a consult has a lot of photos.
const MAX_PHOTOS = 12;
// Route Handlers are cached per-URL by default in the App Router unless
// explicitly opted out — without this, re-downloading the same report
// after editing the record could keep serving the first PDF ever generated.
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data: visit, error } = await supabase
    .from('visits')
    .select(
      '*, patients(id, name, species), clients(id, full_name, phone, email), rooms(name), staff(full_name)'
    )
    .eq('id', params.id)
    .single();

  if (error || !visit) {
    return NextResponse.json({ error: 'consult not found' }, { status: 404 });
  }

  const [{ data: clinic }, { data: diagnostics }, { data: treatmentItems }, { data: attachments }] = await Promise.all([
    supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
    supabase
      .from('diagnostics')
      .select('*, goods_services(name)')
      .eq('visit_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('treatment_items')
      .select('*, goods_services(name, main_category)')
      .eq('visit_id', params.id)
      .order('created_at', { ascending: true }),
    supabase.from('attachments').select('*').eq('entity_type', 'visit').eq('entity_id', params.id),
  ]);

  const imageAttachments = (attachments || []).filter(isImageAttachment).slice(0, MAX_PHOTOS);
  const photos = (await Promise.all(imageAttachments.map(fetchAttachmentBytes))).filter(Boolean);

  const pdfBytes = await buildConsultReportPdf({
    visit,
    clinic,
    diagnostics: diagnostics || [],
    treatmentItems: treatmentItems || [],
    photos,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="consult-report-${params.id}-${Date.now()}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
