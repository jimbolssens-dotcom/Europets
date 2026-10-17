// app/api/invoices/[id]/route.js
// GET   /api/invoices/:id  -> invoice with line items, its payment log, and its discount log
// PATCH /api/invoices/:id  -> void an invoice. Marking one paid isn't a
//                             directly settable status anymore — it's
//                             derived automatically once logged payments
//                             (POST /api/invoices/:id/payments) add up to
//                             the total, so status can't drift from what
//                             was actually collected.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

const VALID_STATUSES = ['void'];

// Next.js can otherwise cache this GET route handler's response (same
// gotcha as app/api/hospitalizations/[id]/route.js) — the invoice detail
// page reloads this after every action (removing a line item, voiding),
// and a cached response would keep showing whatever was true the first
// time this URL was ever hit, no matter how many times it's refetched.
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  // Everything keyed by the invoice id is asked for at once, alongside the
  // invoice itself; only the patient lookup has to wait for the invoice
  // (it needs its visit_id / hospitalization_id). Two rounds to the
  // database instead of six one after another.
  const [
    { data: invoice, error },
    { data: catteryBookings },
    { data: lineItems, error: itemsError },
    { data: payments, error: paymentsError },
    { data: discounts, error: discountsError },
  ] = await Promise.all([
    supabase
      .from('invoices')
      .select('*, clients(id, full_name, phone, email, client_number)')
      .eq('id', params.id)
      .single(),
    // The cattery stay(s) this invoice bills (migration 182).
    supabase
      .from('cattery_bookings')
      .select('id, date_in, date_out, patients(id, name, patient_number)')
      .eq('invoice_id', params.id),
    supabase
      .from('invoice_line_items')
      .select('*, goods_services(name, pricing_type, unit, main_category)')
      .eq('invoice_id', params.id),
    supabase
      .from('invoice_payments')
      .select('*, staff(full_name), donations(donation_number, source)')
      .eq('invoice_id', params.id)
      .order('paid_at', { ascending: false }),
    supabase
      .from('invoice_discounts')
      .select('*, staff(full_name)')
      .eq('invoice_id', params.id)
      .order('applied_at', { ascending: false }),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }
  if (paymentsError) {
    return NextResponse.json({ error: paymentsError.message }, { status: 500 });
  }
  if (discountsError) {
    return NextResponse.json({ error: discountsError.message }, { status: 500 });
  }

  // Two separate queries rather than one nested visits(...)/hospitalizations(...)
  // embed off invoices — a single embed through whichever of visit_id/
  // hospitalization_id happens to be set turned out to fail for
  // hospitalization-linked invoices specifically. invoice.visits/
  // invoice.hospitalizations are still set below so callers reading them
  // (the invoice detail page) don't need to change.
  if (invoice.visit_id) {
    const { data: visit } = await supabase
      .from('visits')
      .select('patients(id, name, patient_number)')
      .eq('id', invoice.visit_id)
      .single();
    invoice.visits = visit || null;
  } else if (invoice.hospitalization_id) {
    const { data: hospitalization } = await supabase
      .from('hospitalizations')
      .select('patients(id, name, patient_number), kind')
      .eq('id', invoice.hospitalization_id)
      .single();
    invoice.hospitalizations = hospitalization || null;
  }
  invoice.cattery_bookings = catteryBookings || [];

  return NextResponse.json({ ...invoice, line_items: lineItems, payments, discounts });
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { status } = body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update({ status })
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
