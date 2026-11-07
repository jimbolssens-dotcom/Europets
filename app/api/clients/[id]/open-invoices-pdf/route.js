// app/api/clients/[id]/open-invoices-pdf/route.js
// GET /api/clients/:id/open-invoices-pdf -> one PDF with every invoice this
// client still owes on (unpaid or partly paid), oldest first, each as its
// full Tax Invoice with line items (lib/taxInvoicePdf.js), so an owner gets
// the invoices themselves, not just the Statement of Account overview
// (Jim, 7 Nov). Sent with the statement from the client page; like the
// statement and each invoice PDF it opens with no login (middleware.js's
// PUBLIC_PATTERNS) and only ever shows the one client its id names.

import { supabase } from '@/lib/supabaseClient';
import { buildTaxInvoicePdf } from '@/lib/taxInvoicePdf';
import { loadTaxInvoiceInputs } from '@/lib/taxInvoiceInputs';
import { PDFDocument } from 'pdf-lib';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request, { params }) {
  const [{ data: invoices, error }, { data: clinic }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_number, total, amount_paid, status, created_at')
      .eq('client_id', params.id)
      .in('status', ['unpaid', 'partially_paid'])
      .gt('total', 0)
      .order('created_at', { ascending: true }),
    supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!invoices?.length) return NextResponse.json({ error: 'No open invoices for this client' }, { status: 404 });

  const merged = await PDFDocument.create();
  for (const inv of invoices) {
    const inputs = await loadTaxInvoiceInputs(supabase, inv.id, clinic || null);
    if (inputs.error) continue;
    const bytes = await buildTaxInvoicePdf(inputs);
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  merged.setTitle(`Open invoices (${invoices.length})`);
  const out = await merged.save();

  return new NextResponse(Buffer.from(out), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="open-invoices-${Date.now()}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
