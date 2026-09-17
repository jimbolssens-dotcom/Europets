// app/api/hospitalizations/rate-options/route.js
// GET -> every hospitalization daily-rate catalog item (Cat, Dog S/M, Dog L,
// plus whatever else staff have added — a rescue/welfare rate, a discounted
// long-term-stay rate, ...) — see lib/hospitalizationCharges.js for exactly
// how these are matched. Used by the Pre-Invoice Overview panel's category
// dropdown.

import { supabase } from '@/lib/supabaseClient';
import { listHospitalizationRateCatalogItems } from '@/lib/hospitalizationCharges';
import { NextResponse } from 'next/server';

export async function GET() {
  const { data, error } = await listHospitalizationRateCatalogItems(supabase);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
