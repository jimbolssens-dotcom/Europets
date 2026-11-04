// app/api/visits/[id]/dispensing-labels-pdf/route.js
// GET /api/visits/:id/dispensing-labels-pdf?item_ids=a,b,c
//   -> dispensing labels for this consult's treatment-plan medications,
//      one page each, the same Brother QL-800 label the invoice page prints
//      (lib/dispensingLabelPdf.js). Jim, 4 Nov: print the label straight
//      from the consult, without going to the invoice first. Reads each
//      item's current instructions; the consult page saves an edit before
//      it prints.

import { supabase } from '@/lib/supabaseClient';
import { buildDispensingLabelsPdf } from '@/lib/dispensingLabelPdf';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { searchParams } = new URL(request.url);
  const itemIds = (searchParams.get('item_ids') || '').split(',').filter(Boolean);
  if (itemIds.length === 0) {
    return NextResponse.json({ error: 'item_ids is required' }, { status: 400 });
  }

  const { data: visit, error: visitError } = await supabase
    .from('visits')
    .select('id, patients(name), clients(full_name)')
    .eq('id', params.id)
    .single();
  if (visitError || !visit) {
    return NextResponse.json({ error: 'consult not found' }, { status: 404 });
  }

  const { data: treatmentItems, error: itemsError } = await supabase
    .from('treatment_items')
    .select('id, instructions, created_at, goods_services(name)')
    .eq('visit_id', params.id)
    .in('id', itemIds)
    .order('created_at', { ascending: true });
  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }
  if (!treatmentItems || treatmentItems.length === 0) {
    return NextResponse.json({ error: 'no matching medications on this consult' }, { status: 400 });
  }

  const items = treatmentItems.map((t) => ({
    medicationName: t.goods_services?.name || 'Medication',
    instructions: t.instructions,
    patientName: visit.patients?.name || null,
    ownerName: visit.clients?.full_name || null,
  }));

  const pdfBytes = await buildDispensingLabelsPdf(items);
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="dispensing-labels-${params.id}-${Date.now()}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
