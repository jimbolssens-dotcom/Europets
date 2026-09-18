// app/api/invoices/[id]/discounts/[discountId]/route.js
// DELETE /api/invoices/:id/discounts/:discountId -> remove a logged
// discount (e.g. a data-entry mistake), recomputing the invoice's
// totals and payment status back up afterward.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { recomputeInvoiceTotals, recomputeInvoicePayments } from '@/lib/invoicing';

export async function DELETE(request, { params }) {
  const { data: discount, error: fetchError } = await supabase
    .from('invoice_discounts')
    .select('id')
    .eq('id', params.discountId)
    .eq('invoice_id', params.id)
    .single();
  if (fetchError || !discount) {
    return NextResponse.json({ error: 'discount not found' }, { status: 404 });
  }

  const { error: deleteError } = await supabaseAdmin
    .from('invoice_discounts')
    .delete()
    .eq('id', params.discountId)
    .eq('invoice_id', params.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: totalsError } = await recomputeInvoiceTotals(supabase, params.id);
  if (totalsError) {
    return NextResponse.json({ error: totalsError.message }, { status: 500 });
  }
  const { data, error } = await recomputeInvoicePayments(supabase, params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
