// app/api/invoices/[id]/line-items/[itemId]/route.js
// PATCH /api/invoices/:id/line-items/:itemId
//   { instructions, voice_note_path } -> edit a line item's dispensing
//      instructions (reviewed/corrected on the invoice detail page's
//      dispensing-label form before printing — see migrations/049)
//      and/or its plain voice note (migration 060). Doesn't touch
//      price/quantity/description.
//   { quantity, administration_method } -> correct an unpaid/partially-paid
//      invoice's line — e.g. the wrong number of tablets was logged, or an
//      injection's SC/IM route was picked wrong. Recomputes line_total
//      from quantity × the item's existing unit_price, then re-applies the
//      administration fee fresh (stripping any previous fee tag first —
//      see stripAdministrationFeeTag) so editing never stacks or leaves a
//      stale fee. If the item is linked to a catalog medication,
//      administration_method is validated against it the same way as
//      adding a new item (see resolveAdministrationMethod) — a dispensed
//      medication can't be switched to SC/IM here and vice versa; an
//      unlinked custom line item accepts any of dispense/sc/im directly.
//   At least one field must be given; several may be combined in one call.
// DELETE /api/invoices/:id/line-items/:itemId  -> remove a line item, recomputing totals
//
// Both PATCH (when it would lower the total) and DELETE are blocked if the
// result would drop the invoice's total below what's already been paid
// (invoices.amount_paid, from logged payments — see
// app/api/invoices/[id]/payments) — that amount was already collected, so
// lowering it needs a refund/payment adjustment handled separately, not a
// total that's silently less than the cash received.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { recomputeInvoiceTotals, applyAdministrationFee, stripAdministrationFeeTag, VAT_RATE } from '@/lib/invoicing';
import { resolveAdministrationMethod } from '@/lib/administrationMethods';

export async function PATCH(request, { params }) {
  const body = await request.json();
  const hasInstructions = body.instructions !== undefined;
  const hasVoiceNote = body.voice_note_path !== undefined;
  const hasQuantity = body.quantity !== undefined;
  const hasAdministrationMethod = body.administration_method !== undefined;

  if (!hasInstructions && !hasVoiceNote && !hasQuantity && !hasAdministrationMethod) {
    return NextResponse.json(
      { error: 'instructions, voice_note_path, quantity, or administration_method is required' },
      { status: 400 }
    );
  }

  const { data: current, error: currentError } = await supabase
    .from('invoice_line_items')
    .select('*, goods_services(administration_method)')
    .eq('id', params.itemId)
    .eq('invoice_id', params.id)
    .single();

  if (currentError || !current) {
    return NextResponse.json({ error: 'line item not found' }, { status: 404 });
  }

  const update = {};
  if (hasInstructions) update.instructions = body.instructions === '' ? null : body.instructions;
  if (hasVoiceNote) update.voice_note_path = body.voice_note_path || null;

  if (hasQuantity || hasAdministrationMethod) {
    const quantity = hasQuantity ? Number(body.quantity) : Number(current.quantity);
    if (Number.isNaN(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 });
    }

    let administrationMethod;
    if (current.goods_service_id) {
      const resolved = resolveAdministrationMethod(
        current.goods_services?.administration_method,
        hasAdministrationMethod ? body.administration_method : current.administration_method
      );
      if (resolved.error) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }
      administrationMethod = resolved.administration_method;
    } else {
      const method = hasAdministrationMethod ? body.administration_method : current.administration_method;
      if (method && !['dispense', 'sc', 'im'].includes(method)) {
        return NextResponse.json({ error: 'administration_method must be one of dispense, sc, im' }, { status: 400 });
      }
      administrationMethod = method || null;
    }

    const unit_price = Number(current.unit_price);
    const baseDescription = stripAdministrationFeeTag(current.description);
    let line = {
      description: baseDescription,
      line_total: Math.round(unit_price * quantity * 100) / 100,
    };
    if (administrationMethod) {
      const { data: clinicSettings } = await supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle();
      line = applyAdministrationFee(line, administrationMethod, clinicSettings);
    }

    update.quantity = quantity;
    update.description = line.description;
    update.line_total = line.line_total;
    update.administration_method = administrationMethod;

    if (Number(current.line_total) !== line.line_total) {
      const { data: invoice } = await supabase.from('invoices').select('amount_paid').eq('id', params.id).single();
      if (invoice && Number(invoice.amount_paid) > 0) {
        const { data: otherItems } = await supabase
          .from('invoice_line_items')
          .select('line_total')
          .eq('invoice_id', params.id)
          .neq('id', params.itemId);
        const subtotalAfter = (otherItems || []).reduce((sum, li) => sum + Number(li.line_total), 0) + line.line_total;
        const totalAfter = Math.round(subtotalAfter * (1 + VAT_RATE) * 100) / 100;
        if (totalAfter < Number(invoice.amount_paid) - 0.01) {
          return NextResponse.json(
            {
              error: `this change would drop the total below the AED ${Number(invoice.amount_paid).toFixed(2)} already paid — remove a logged payment first if this is a genuine refund`,
            },
            { status: 400 }
          );
        }
      }
    }
  }

  let previousVoiceNotePath = null;
  if (hasVoiceNote) {
    previousVoiceNotePath = current.voice_note_path || null;
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

  if (hasQuantity || hasAdministrationMethod) {
    const { error: totalsError } = await recomputeInvoiceTotals(supabase, params.id);
    if (totalsError) {
      return NextResponse.json({ error: totalsError.message }, { status: 500 });
    }
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
