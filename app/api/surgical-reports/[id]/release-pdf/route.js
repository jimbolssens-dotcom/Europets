// app/api/surgical-reports/[id]/release-pdf/route.js
// GET /api/surgical-reports/:id/release-pdf -> the vet-reviewed, saved
// postop_instructions as a PDF handout — for staff to download/print, or
// linked directly in the WhatsApp/email "send to owner" buttons on the
// consult page (this route needs no auth, same as the consent-form PDF
// route, since the app has no staff auth to begin with).

import { supabase } from '@/lib/supabaseClient';
import { buildPostOpReleasePdf } from '@/lib/postOpReleasePdf';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data: report, error } = await supabase
    .from('surgical_reports')
    .select('procedure_name, postop_instructions, performed_at, visits(patients(name, species), clients(full_name))')
    .eq('id', params.id)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: 'surgical report not found' }, { status: 404 });
  }
  if (!report.postop_instructions) {
    return NextResponse.json({ error: 'no post-op instructions saved for this report yet' }, { status: 409 });
  }

  const { data: clinic } = await supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle();

  const pdfBytes = await buildPostOpReleasePdf({
    procedureType: 'surgical',
    procedureTitle: report.procedure_name ? `Post-Op Care — ${report.procedure_name}` : undefined,
    patient: report.visits?.patients,
    client: report.visits?.clients,
    clinic,
    performedAt: report.performed_at,
    instructions: report.postop_instructions,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="post-op-care-${params.id}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
