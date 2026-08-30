// app/api/invoices/[id]/line-items/[itemId]/route.js
// DELETE /api/invoices/:id/line-items/:itemId  -> remove a line item, recomputing totals

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { recomputeInvoiceTotals } from '@/lib/invoicing';

export async function DELETE(request, { params }) {
  const { error: deleteError } = await supabase
    .from('invoice_line_items')
    .delete()
    .eq('id', params.itemId)
    .eq('invoice_id', params.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { data, error: totalsError } = await recomputeInvoiceTotals(supabase, params.id);
  if (totalsError) {
    return NextResponse.json({ error: totalsError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
