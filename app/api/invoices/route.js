// app/api/invoices/route.js
// GET  /api/invoices?client_id=X&status=unpaid&visit_id=Y  -> list invoices
// POST /api/invoices                            -> open a new (empty) invoice
//
// An invoice can be tied to a visit (visit_id) for context, or stand alone
// (e.g. a product-only sale). Line items are added afterwards via
// /api/invoices/:id/line-items, which recompute the totals.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');
  const status = searchParams.get('status');
  const visitId = searchParams.get('visit_id');

  let query = supabase
    .from('invoices')
    .select('*, clients(full_name), visits(patient_id, patients(name))')
    .order('created_at', { ascending: false });

  if (clientId) query = query.eq('client_id', clientId);
  if (status) query = query.eq('status', status);
  if (visitId) query = query.eq('visit_id', visitId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  let { client_id, visit_id } = body;

  if (visit_id && !client_id) {
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('client_id')
      .eq('id', visit_id)
      .single();

    if (visitError || !visit) {
      return NextResponse.json({ error: 'visit not found' }, { status: 400 });
    }
    client_id = visit.client_id;
  }

  if (!client_id) {
    return NextResponse.json(
      { error: 'client_id is required (directly, or via visit_id)' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('invoices')
    .insert([{ client_id, visit_id: visit_id || null }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
