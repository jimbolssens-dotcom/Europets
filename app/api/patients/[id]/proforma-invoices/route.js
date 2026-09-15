// app/api/patients/[id]/proforma-invoices/route.js
// GET  /api/patients/:id/proforma-invoices -> every quote drafted for this
//      patient (newest first), with its items so the patient page can show
//      a running total per quote without a second request each.
// POST /api/patients/:id/proforma-invoices -> open a new (empty) quote —
//      client_id is resolved from the patient. Items are added afterwards
//      via /api/proforma-invoices/:id/items, same shape as a real invoice.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('proforma_invoices')
    .select('*, proforma_invoice_items(quantity, unit_price, line_total)')
    .eq('patient_id', params.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));

  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('client_id')
    .eq('id', params.id)
    .single();

  if (patientError || !patient) {
    return NextResponse.json({ error: 'patient not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('proforma_invoices')
    .insert([{ patient_id: params.id, client_id: patient.client_id, created_by: body.created_by || null }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
