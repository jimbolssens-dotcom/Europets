// app/api/proforma-invoices/[id]/quote-pdf/route.js
// GET /api/proforma-invoices/:id/quote-pdf -> the quotation PDF — for
// staff to download/print, or linked directly to the client via WhatsApp/
// email (see the proforma page), so this route needs no auth — see
// middleware.js's PUBLIC_PATTERNS.

import { supabase } from '@/lib/supabaseClient';
import { buildProformaQuotePdf } from '@/lib/proformaQuotePdf';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request, { params }) {
  const { data: quote, error } = await supabase
    .from('proforma_invoices')
    .select('*, clients(full_name, phone, email, client_number), patients(name, species, patient_number)')
    .eq('id', params.id)
    .single();

  if (error || !quote) {
    return NextResponse.json({ error: 'quote not found' }, { status: 404 });
  }

  const [{ data: items, error: itemsError }, { data: clinic }] = await Promise.all([
    supabase
      .from('proforma_invoice_items')
      .select('*, goods_services(name, pricing_type, unit, main_category)')
      .eq('proforma_invoice_id', params.id)
      .order('created_at', { ascending: true }),
    supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
  ]);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const pdfBytes = await buildProformaQuotePdf({
    quote,
    items: items || [],
    clinic,
    client: quote.clients,
    patient: quote.patients,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="quotation-${params.id}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
