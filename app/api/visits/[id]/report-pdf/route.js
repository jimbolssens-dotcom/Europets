// app/api/visits/[id]/report-pdf/route.js
// GET /api/visits/:id/report-pdf -> a PDF summary of this consult (vitals,
// exam notes, diagnostics, treatment plan), for the vet to download and
// send to the client (e.g. attach in WhatsApp or an email).

import { supabase } from '@/lib/supabaseClient';
import { buildConsultReportPdf } from '@/lib/consultReportPdf';
import { NextResponse } from 'next/server';

export const maxDuration = 30;
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

  const [{ data: diagnostics }, { data: treatmentItems }] = await Promise.all([
    supabase.from('diagnostics').select('*').eq('visit_id', params.id).order('created_at', { ascending: true }),
    supabase
      .from('treatment_items')
      .select('*, goods_services(name)')
      .eq('visit_id', params.id)
      .order('created_at', { ascending: true }),
  ]);

  const pdfBytes = await buildConsultReportPdf({
    visit,
    diagnostics: diagnostics || [],
    treatmentItems: treatmentItems || [],
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="consult-report-${params.id}-${Date.now()}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
