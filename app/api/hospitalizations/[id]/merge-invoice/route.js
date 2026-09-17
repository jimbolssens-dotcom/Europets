// app/api/hospitalizations/[id]/merge-invoice/route.js
// POST body: { into: <hospitalization id> } — permanently redirects this
// hospitalization's billing onto `into`'s invoice (see migration 114 and
// lib/invoicing.js#resolveInvoiceHospitalizationFamily). This is a one-way
// door in the sense that undoing it is a manual staff action (clearing
// invoice_merged_with and re-syncing both records), not a button — merges
// are meant to be a deliberate "these two cases are actually one bill"
// call, not something to toggle back and forth.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { syncHospitalizationInvoice } from '@/lib/invoicing';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const sourceId = params.id;
  const body = await request.json().catch(() => ({}));
  const targetId = body?.into;

  if (!targetId || targetId === sourceId) {
    return NextResponse.json({ error: 'A valid target hospitalization is required' }, { status: 400 });
  }

  const [{ data: source, error: sourceError }, { data: target, error: targetError }] = await Promise.all([
    supabase.from('hospitalizations').select('id, client_id, invoice_merged_with').eq('id', sourceId).single(),
    supabase.from('hospitalizations').select('id, client_id, invoice_merged_with').eq('id', targetId).single(),
  ]);

  if (sourceError || !source || targetError || !target) {
    return NextResponse.json({ error: 'Hospitalization not found' }, { status: 404 });
  }
  if (source.client_id !== target.client_id) {
    return NextResponse.json({ error: 'Both cases must belong to the same client' }, { status: 400 });
  }
  if (source.invoice_merged_with) {
    return NextResponse.json({ error: 'This case is already merged into another invoice' }, { status: 400 });
  }
  if (target.invoice_merged_with) {
    return NextResponse.json(
      { error: 'That invoice is itself merged into another case — merge into the original case instead' },
      { status: 400 }
    );
  }

  // One hop only (see resolveInvoiceHospitalizationFamily): a case that is
  // already the primary for other merged-in cases can't also become a
  // merged-away leaf itself, or those other cases would point at a primary
  // (this one) that no longer holds the invoice.
  const { data: existingMembers } = await supabase
    .from('hospitalizations')
    .select('id')
    .eq('invoice_merged_with', sourceId)
    .limit(1);
  if (existingMembers && existingMembers.length > 0) {
    return NextResponse.json(
      { error: 'This case already has another case merged into its own invoice, so it can\'t be merged away' },
      { status: 400 }
    );
  }

  const { data: sourceInvoice } = await supabase
    .from('invoices')
    .select('id, amount_paid')
    .eq('hospitalization_id', sourceId)
    .neq('status', 'void')
    .limit(1)
    .maybeSingle();

  if (sourceInvoice && Number(sourceInvoice.amount_paid) > 0) {
    return NextResponse.json(
      { error: 'This case already has a payment logged against its invoice — resolve that payment before merging' },
      { status: 400 }
    );
  }

  const { error: mergeError } = await supabaseAdmin
    .from('hospitalizations')
    .update({ invoice_merged_with: targetId })
    .eq('id', sourceId);
  if (mergeError) {
    return NextResponse.json({ error: mergeError.message }, { status: 500 });
  }

  if (sourceInvoice) {
    const { error: voidError } = await supabaseAdmin
      .from('invoices')
      .update({ status: 'void' })
      .eq('id', sourceInvoice.id);
    if (voidError) {
      return NextResponse.json({ error: voidError.message }, { status: 500 });
    }
  }

  const result = await syncHospitalizationInvoice(supabase, targetId);
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: 200 });
}
