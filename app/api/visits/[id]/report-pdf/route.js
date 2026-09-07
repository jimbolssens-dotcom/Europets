// app/api/visits/:id/report-pdf/route.js
// GET /api/visits/:id/report-pdf -> the client-facing consult report (see
// generateConsultReport in lib/anthropicClient.js) as a PDF —
// for staff to download/print, or linked directly in the WhatsApp/email
// "send to owner" buttons on the consult page. Public — no staff login —
// same carve-out as the surgical/dental report-pdf routes (see
// middleware.js), since the point is for a client to be able to open it.

import { supabase } from '@/lib/supabaseClient';
import { buildProcedureReportPdf } from '@/lib/procedureReportPdf';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data: visit, error } = await supabase
    .from('visits')
    .select('ai_summary, started_at, staff(full_name), patients(name, species), clients(full_name)')
    .eq('id', params.id)
    .single();

  if (error || !visit) {
    return NextResponse.json({ error: 'consult not found' }, { status: 404 });
  }

  const { data: clinic } = await supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle();

  const pdfBytes = await buildProcedureReportPdf({
    procedureType: 'consult',
    procedureTitle: 'Consult Report',
    patient: visit.patients,
    client: visit.clients,
    clinic,
    performedAt: visit.started_at,
    staffName: visit.staff?.full_name,
    sections: [{ text: visit.ai_summary }],
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="consult-report-${params.id}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
