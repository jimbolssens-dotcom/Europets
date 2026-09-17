// app/api/donations/[id]/route.js
// GET    /api/donations/:id  -> one donation plus its full allocation
//        trail — every invoice (and therefore patient/case) its money has
//        gone to. This is the "which cases did this donation help" view;
//        it costs no extra schema since that's just which invoice_payments
//        rows are tagged with this donation's id (see migration 111).
// DELETE /api/donations/:id  -> remove one (blocked once any of its money
//        has been applied to an invoice — same guard pattern as staff/
//        catalog deletes elsewhere in the app).

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

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
