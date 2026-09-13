// app/api/invoices/[id]/dispensing-labels-pdf/route.js
// GET /api/invoices/:id/dispensing-labels-pdf?item_ids=a,b,c
//   -> a PDF of dispensing labels, one page per requested invoice line
//      item, sized for a Brother QL-800 (62mm continuous tape). Reads
//      each item's current `instructions` from the database — the
//      invoice detail page PATCHes any edits there first (see
//      app/api/invoices/[id]/line-items/[itemId]) so what's printed
//      always matches what was reviewed on screen.

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

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('*, clients(full_name)')
    .eq('id', params.id)
    .single();

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
  }

  // Two separate queries rather than one nested visits(...)/hospitalizations(...)
  // embed off invoices — see app/api/invoices/[id]/route.js for why.
  let patient = null;
  if (invoice.visit_id) {
    const { data: visit } = await supabase.from('visits').select('patients(name)').eq('id', invoice.visit_id).single();
    patient = visit?.patients || null;
  } else if (invoice.hospitalization_id) {
    const { data: hospitalization } = await supabase
      .from('hospitalizations')
      .select('patients(name)')
      .eq('id', invoice.hospitalization_id)
      .single();
    patient = hospitalization?.patients || null;
  }

  const { data: lineItems, error: itemsError } = await supabase
    .from('invoice_line_items')
    .select('*, goods_services(name)')
    .eq('invoice_id', params.id)
    .in('id', itemIds);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }
  if (!lineItems || lineItems.length === 0) {
    return NextResponse.json({ error: 'no matching line items on this invoice' }, { status: 400 });
  }

  const patientName = patient?.name || null;
  const ownerName = invoice.clients?.full_name || null;

  const items = lineItems.map((li) => ({
    medicationName: li.goods_services?.name || li.description,
    instructions: li.instructions,
    patientName,
    ownerName,
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
