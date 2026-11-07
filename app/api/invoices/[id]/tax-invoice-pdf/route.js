// app/api/invoices/[id]/tax-invoice-pdf/route.js
// GET /api/invoices/:id/tax-invoice-pdf -> a UAE FTA-compliant Tax
// Invoice PDF for this invoice: clinic TRN/identity, client details,
// sequential invoice number, line items with VAT, and the totals.

import { supabase } from '@/lib/supabaseClient';
import { buildTaxInvoicePdf } from '@/lib/taxInvoicePdf';
import { loadTaxInvoiceInputs } from '@/lib/taxInvoiceInputs';
import { NextResponse } from 'next/server';

// Route Handlers are cached per-URL by default in the App Router unless
// explicitly opted out — without this, re-downloading the same invoice
// after editing it could keep serving the first-ever generated PDF.
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const inputs = await loadTaxInvoiceInputs(supabase, params.id);
  if (inputs.error) {
    return NextResponse.json({ error: inputs.error }, { status: 404 });
  }
  const { invoice } = inputs;
  const pdfBytes = await buildTaxInvoicePdf(inputs);

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="tax-invoice-${invoice.invoice_number || invoice.id}-${Date.now()}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
