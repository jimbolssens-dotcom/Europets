// app/api/clients/[id]/statement-pdf/route.js
// GET /api/clients/:id/statement-pdf -> a Statement of Account PDF for
// this client: every non-void invoice and every payment against it,
// chronological with a running balance, plus a total invoiced/paid/
// outstanding summary. Linked directly to a client via WhatsApp/email
// (see the client page), same as the tax-invoice-pdf route, so this needs
// no auth — see middleware.js's PUBLIC_PATTERNS.

import { supabase } from '@/lib/supabaseClient';
import { buildStatementOfAccountsPdf } from '@/lib/statementOfAccountsPdf';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request, { params }) {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', params.id)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: 'client not found' }, { status: 404 });
  }

  const [{ data: invoices, error: invoicesError }, { data: clinic }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_number, total, amount_paid, status, created_at')
      .eq('client_id', params.id)
      .neq('status', 'void')
      .order('created_at', { ascending: true }),
    supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
  ]);

  if (invoicesError) {
    return NextResponse.json({ error: invoicesError.message }, { status: 500 });
  }

  const invoiceIds = (invoices || []).map((inv) => inv.id);
  const paymentsByInvoiceId = new Map();
  if (invoiceIds.length > 0) {
    const { data: payments, error: paymentsError } = await supabase
      .from('invoice_payments')
      .select('invoice_id, amount, payment_method, paid_at')
      .in('invoice_id', invoiceIds)
      .order('paid_at', { ascending: true });
    if (paymentsError) {
      return NextResponse.json({ error: paymentsError.message }, { status: 500 });
    }
    for (const payment of payments || []) {
      if (!paymentsByInvoiceId.has(payment.invoice_id)) paymentsByInvoiceId.set(payment.invoice_id, []);
      paymentsByInvoiceId.get(payment.invoice_id).push(payment);
    }
  }

  const pdfBytes = await buildStatementOfAccountsPdf({
    client,
    invoices: invoices || [],
    paymentsByInvoiceId,
    clinic,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="statement-of-account-${client.client_number || client.id}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
