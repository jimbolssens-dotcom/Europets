// app/api/invoices/[id]/line-items/[itemId]/route.js
// PATCH /api/invoices/:id/line-items/:itemId  { instructions, voice_note_path }
//   -> edit a line item's dispensing instructions (reviewed/corrected on
//      the invoice detail page's dispensing-label form before printing —
//      see migrations/049) and/or its plain voice note (migration 060).
//      Either field is optional but at least one must be given. Doesn't
//      touch price/quantity/description.
// DELETE /api/invoices/:id/line-items/:itemId  -> remove a line item, recomputing totals
//
// Blocked if it would drop the invoice's total below what's already been
// paid (invoices.amount_paid, from logged payments — see
// app/api/invoices/[id]/payments) — the item's price was already
// collected, so removing it needs a refund/payment adjustment handled
// separately, not a total that's silently less than the cash received.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { recomputeInvoiceTotals, VAT_RATE } from '@/lib/invoicing';

export async function PATCH(request, { params }) {
  const body = await request.json();
  const hasInstructions = body.instructions !== undefined;
  const hasVoiceNote = body.voice_note_path !== undefined;

  if (!hasInstructions && !hasVoiceNote) {
    return NextResponse.json({ error: 'instructions or voice_note_path is required' }, { status: 400 });
  }

  const update = {};
  if (hasInstructions) update.instructions = body.instructions === '' ? null : body.instructions;
  if (hasVoiceNote) update.voice_note_path = body.voice_note_path || null;

  let previousVoiceNotePath = null;
  if (hasVoiceNote) {
    const { data: existing } = await supabase
      .from('invoice_line_items')
      .select('voice_note_path')
      .eq('id', params.itemId)
      .single();
    previousVoiceNotePath = existing?.voice_note_path || null;
  }

  const { data, error } = await supabase
    .from('invoice_line_items')
    .update(update)
    .eq('id', params.itemId)
    .eq('invoice_id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'line item not found' }, { status: 404 });
  }

  // Being replaced or cleared — the old clip has no further purpose.
  if (previousVoiceNotePath && previousVoiceNotePath !== data.voice_note_path) {
    await supabase.storage.from('consult-files').remove([previousVoiceNotePath]);
  }

  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const [{ data: invoice, error: invoiceError }, { data: item, error: itemError }] = await Promise.all([
    supabase.from('invoices').select('amount_paid').eq('id', params.id).single(),
    supabase.from('invoice_line_items').select('line_total').eq('id', params.itemId).single(),
  ]);

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
  }
  if (itemError || !item) {
    return NextResponse.json({ error: 'line item not found' }, { status: 404 });
  }

  if (Number(invoice.amount_paid) > 0) {
    // Recompute what the total would be without this line, VAT included, and
    // compare against what's already been collected.
    const { data: remainingItems } = await supabase
      .from('invoice_line_items')
      .select('line_total')
      .eq('invoice_id', params.id)
      .neq('id', params.itemId);
    const subtotalAfter = (remainingItems || []).reduce((sum, li) => sum + Number(li.line_total), 0);
    const totalAfter = Math.round(subtotalAfter * (1 + VAT_RATE) * 100) / 100;
    if (totalAfter < Number(invoice.amount_paid) - 0.01) {
      return NextResponse.json(
        {
          error: `removing this item would drop the total below the AED ${Number(invoice.amount_paid).toFixed(2)} already paid — remove a logged payment first if this is a genuine refund`,
        },
        { status: 400 }
      );
    }
  }

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
