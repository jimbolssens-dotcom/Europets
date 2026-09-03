// app/api/invoices/[id]/tax-invoice-pdf/route.js
// GET /api/invoices/:id/tax-invoice-pdf -> a UAE FTA-compliant Tax
// Invoice PDF for this invoice: clinic TRN/identity, client details,
// sequential invoice number, line items with VAT, and the totals.

import { supabase } from '@/lib/supabaseClient';
import { buildTaxInvoicePdf } from '@/lib/taxInvoicePdf';
import { NextResponse } from 'next/server';

// Route Handlers are cached per-URL by default in the App Router unless
// explicitly opted out — without this, re-downloading the same invoice
// after editing it could keep serving the first-ever generated PDF.
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(
      '*, clients(client_number, full_name, phone, email, address, trn), visits(patients(patient_number, name, species, microchip_number)), hospitalizations(patients(patient_number, name, species, microchip_number))'
    )
    .eq('id', params.id)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
  }

  const [{ data: lineItems }, { data: clinic }] = await Promise.all([
    supabase
      .from('invoice_line_items')
      .select('*, goods_services(main_category)')
      .eq('invoice_id', params.id)
      .order('id'),
    supabase.from('clinic_settings').select('*').eq('id', true).single(),
  ]);

  const pdfBytes = await buildTaxInvoicePdf({
    invoice,
    lineItems: lineItems || [],
    clinic,
    client: invoice.clients,
    patient: invoice.visits?.patients || invoice.hospitalizations?.patients || null,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="tax-invoice-${invoice.invoice_number || invoice.id}-${Date.now()}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
