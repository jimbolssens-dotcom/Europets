// app/api/donations/[id]/route.js
// GET    /api/donations/:id  -> one donation plus its full allocation
//        trail — every invoice (and therefore patient/case) its money has
//        gone to. This is the "which cases did this donation help" view;
//        it costs no extra schema since that's just which invoice_payments
//        rows are tagged with this donation's id (see migration 111).
// DELETE /api/donations/:id  -> remove one (blocked once any of its money
//        has been applied to an invoice — same guard pattern as staff/
//        catalog deletes elsewhere in the app).
// PATCH  /api/donations/:id  -> correct a payment logged in error (wrong
//        amount, source, date, ...). donation_number is never editable —
//        it's the sequence position, not a field. Any subset of fields may
//        be sent; amount is blocked from dropping below whatever's already
//        applied to an invoice (see the apply endpoint), same balance
//        invariant DELETE already protects.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

const SOURCES = ['nomod', 'paymob', 'paypal', 'bank_transfer'];

export async function GET(request, { params }) {
  const { data: donation, error } = await supabase.from('donations').select('*').eq('id', params.id).single();
  if (error || !donation) {
    return NextResponse.json({ error: 'donation not found' }, { status: 404 });
  }

  const { data: allocations, error: allocError } = await supabase
    .from('invoice_payments')
    .select(
      'id, amount, paid_at, invoices(id, invoice_number, status, client_id, clients(full_name), visits(patients(name)), hospitalizations(patients(name)))'
    )
    .eq('donation_id', params.id)
    .order('paid_at', { ascending: false });

  if (allocError) {
    return NextResponse.json({ error: allocError.message }, { status: 500 });
  }

  const allocated = Math.round((allocations || []).reduce((sum, a) => sum + Number(a.amount), 0) * 100) / 100;

  return NextResponse.json({
    ...donation,
    allocated,
    remaining: Math.round((Number(donation.amount) - allocated) * 100) / 100,
    allocations: allocations || [],
  });
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { donor_name, donor_contact, amount, source, received_at, notes } = body;

  const update = {};
  if (donor_name !== undefined) update.donor_name = donor_name || null;
  if (donor_contact !== undefined) update.donor_contact = donor_contact || null;
  if (notes !== undefined) update.notes = notes || null;
  if (received_at !== undefined) {
    if (!received_at) return NextResponse.json({ error: 'received_at is required' }, { status: 400 });
    update.received_at = received_at;
  }
  if (source !== undefined) {
    if (!SOURCES.includes(source)) {
      return NextResponse.json({ error: `source must be one of ${SOURCES.join(', ')}` }, { status: 400 });
    }
    update.source = source;
  }
  if (amount !== undefined) {
    const numericAmount = Number(amount);
    if (!numericAmount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
    }
    const { data: allocations, error: allocError } = await supabase
      .from('invoice_payments')
      .select('amount')
      .eq('donation_id', params.id);
    if (allocError) return NextResponse.json({ error: allocError.message }, { status: 500 });
    const allocated = (allocations || []).reduce((sum, a) => sum + Number(a.amount), 0);
    if (numericAmount < allocated - 0.01) {
      return NextResponse.json(
        { error: `amount can't be less than the AED ${allocated.toFixed(2)} already applied to invoices` },
        { status: 400 }
      );
    }
    update.amount = Math.round(numericAmount * 100) / 100;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('donations').update(update).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'donation not found' }, { status: 404 });

  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { error } = await supabaseAdmin.from('donations').delete().eq('id', params.id);

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        { error: "cannot delete this donation — it's already been applied to an invoice" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
