// app/api/invoices/[id]/payments/[paymentId]/route.js
// DELETE /api/invoices/:id/payments/:paymentId -> remove a logged payment
// (e.g. a data-entry mistake), recomputing the invoice's amount_paid and
// status back down afterward.
//
// This route sits under the general, PIN-only /api/invoices path (not
// /api/accounting or /api/donations), but removing a donation-tagged
// payment effectively hands that donation's money back to the pool — an
// accounting-consequential action the accountant should own. So that one
// case is re-checked here against the accounting password even though the
// route as a whole isn't gated.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { recomputeInvoicePayments } from '@/lib/invoicing';
import { isAccountingRequest } from '@/lib/accountingAuth';

export async function DELETE(request, { params }) {
  const { data: payment, error: fetchError } = await supabase
    .from('invoice_payments')
    .select('donation_id')
    .eq('id', params.paymentId)
    .eq('invoice_id', params.id)
    .single();
  if (fetchError || !payment) {
    return NextResponse.json({ error: 'payment not found' }, { status: 404 });
  }
  if (payment.donation_id && !(await isAccountingRequest(request))) {
    return NextResponse.json(
      { error: 'This payment came from a donation — removing it requires accounting access.' },
      { status: 403 }
    );
  }

  const { error: deleteError } = await supabaseAdmin
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
