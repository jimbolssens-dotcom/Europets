// app/api/proforma-invoices/route.js
// GET /api/proforma-invoices -> every quote drafted, across every patient
// (newest first) — the "Quotes" filter on the Invoices page, alongside
// paid/unpaid/void, so nothing here needs a patient_id to browse the full
// log until staff deletes one (see DELETE /api/proforma-invoices/:id).

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET() {
  const { data, error } = await supabase
    .from('proforma_invoices')
    .select(
      '*, clients(full_name, client_number), patients(name, patient_number), proforma_invoice_items(quantity, unit_price, line_total)'
    )
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
