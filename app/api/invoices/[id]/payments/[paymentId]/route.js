// app/api/invoices/[id]/payments/[paymentId]/route.js
// DELETE /api/invoices/:id/payments/:paymentId -> remove a logged payment
// (e.g. a data-entry mistake), recomputing the invoice's amount_paid and
// status back down afterward.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { recomputeInvoicePayments } from '@/lib/invoicing';

export async function DELETE(request, { params }) {
  const { error: deleteError } = await supabase
    .from('invoice_payments')
    .delete()
    .eq('id', params.paymentId)
    .eq('invoice_id', params.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { data, error } = await recomputeInvoicePayments(supabase, params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
