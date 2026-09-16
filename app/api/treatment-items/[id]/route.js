// app/api/treatment-items/[id]/route.js
// PATCH  /api/treatment-items/:id  -> edit an existing item's instructions/
//                                      quantity — e.g. from the hospitalization
//                                      worksheet's day-level medication log
//                                      (app/(admin)/hospitalization/[id]).
//                                      Not which goods/service it is or which
//                                      entry it belongs to — that's a
//                                      remove-and-re-add, not an edit.
//                                      billable toggles whether it turns into
//                                      an invoice charge (see migration 096)
//                                      — e.g. an item dictated straight onto
//                                      the plan that turns out to be
//                                      something the owner already has at
//                                      home. Only affects future invoice
//                                      syncs (lib/invoicing.js); a line
//                                      already added to an invoice before
//                                      this is toggled isn't touched — remove
//                                      or edit it on the invoice itself.
//                                      administration_method is a one-off
//                                      correction for this logged item only
//                                      (e.g. a dictation mismatch) — it does
//                                      not change the catalog item's own
//                                      fixed default (see migration 095),
//                                      which is what every future item still
//                                      gets copied from.
// DELETE /api/treatment-items/:id  -> remove a planned treatment item

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

const ADMINISTRATION_METHODS = ['dispense', 'sc', 'im'];

export async function PATCH(request, { params }) {
  const body = await request.json();
  const update = {};
  if (body.instructions !== undefined) update.instructions = body.instructions === '' ? null : body.instructions;
  if (body.quantity !== undefined) update.quantity = body.quantity === '' ? 1 : Number(body.quantity);
  if (body.billable !== undefined) update.billable = !!body.billable;
  if (body.administration_method !== undefined) {
    if (body.administration_method && !ADMINISTRATION_METHODS.includes(body.administration_method)) {
      return NextResponse.json(
        { error: `administration_method must be one of ${ADMINISTRATION_METHODS.join(', ')}` },
        { status: 400 }
      );
    }
    update.administration_method = body.administration_method || null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('treatment_items')
    .update(update)
    .eq('id', params.id)
    .select('*, goods_services(name, main_category, subcategory_id, pricing_type, unit, base_price)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { error } = await supabaseAdmin.from('treatment_items').delete().eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
