// app/api/hospitalizations/[id]/replace-rate-charges/route.js
// POST body: { invoice_id, goods_service_id } -> repoints every existing
// hospitalization-rate charge on this stay (already invoiced days
// included) at goods_service_id — see
// lib/invoicing.js#replaceHospitalizationRateCharges for exactly what this
// does and why deleting a line by hand doesn't work for this. A deliberate,
// explicit action distinct from the Pre-Invoice Overview panel's category
// dropdown, which only ever affects days not yet charged.

import { supabase } from '@/lib/supabaseClient';
import { replaceHospitalizationRateCharges } from '@/lib/invoicing';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { invoice_id, goods_service_id } = body;

  if (!invoice_id || !goods_service_id) {
    return NextResponse.json({ error: 'invoice_id and goods_service_id are required' }, { status: 400 });
  }

  const { error, changed } = await replaceHospitalizationRateCharges(
    supabase,
    params.id,
    invoice_id,
    goods_service_id
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ changed: changed ?? 0 });
}
