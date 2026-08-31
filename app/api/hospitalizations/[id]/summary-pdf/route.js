// app/api/hospitalizations/[id]/summary-pdf/route.js
// GET /api/hospitalizations/:id/summary-pdf -> a PDF summary of the
// admission and its day-to-day worksheet, for the vet to download and
// send to the client (e.g. attach in WhatsApp).

import { supabase } from '@/lib/supabaseClient';
import { buildHospitalizationSummaryPdf } from '@/lib/hospitalizationSummaryPdf';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { data: admission, error } = await supabase
    .from('hospitalizations')
    .select(
      '*, patients(id, name, species, current_weight_kg), clients(id, full_name, phone), rooms(name)'
    )
    .eq('id', params.id)
    .single();

  if (error || !admission) {
    return NextResponse.json({ error: 'admission not found' }, { status: 404 });
  }

  const { data: notes } = await supabase
    .from('hospitalization_notes')
    .select('*, staff(full_name)')
    .eq('hospitalization_id', params.id)
    .order('note_date', { ascending: true });

  const pdfBytes = await buildHospitalizationSummaryPdf({ admission, notes: notes || [] });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="hospitalization-summary-${params.id}.pdf"`,
    },
  });
}
