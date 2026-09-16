// app/api/proforma-invoices/[id]/route.js
// GET    /api/proforma-invoices/:id -> quote with its items, patient, and client
// DELETE /api/proforma-invoices/:id -> discard the quote entirely (items
//        cascade) — nothing here ever reached accounting, so there's
//        nothing to reconcile or void, unlike a real invoice.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { data: quote, error } = await supabase
    .from('proforma_invoices')
    .select('*, clients(full_name, phone, email, client_number), patients(id, name, species, patient_number)')
    .eq('id', params.id)
    .single();

  if (error || !quote) {
    return NextResponse.json({ error: 'quote not found' }, { status: 404 });
  }

  const { data: items, error: itemsError } = await supabase
    .from('proforma_invoice_items')
    .select('*, goods_services(name, pricing_type, unit, main_category)')
    .eq('proforma_invoice_id', params.id)
    .order('created_at', { ascending: true });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  return NextResponse.json({ ...quote, items });
}

export async function DELETE(request, { params }) {
  const { error } = await supabaseAdmin.from('proforma_invoices').delete().eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
