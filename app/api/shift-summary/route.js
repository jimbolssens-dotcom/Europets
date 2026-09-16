// app/api/shift-summary/route.js
// GET /api/shift-summary?date=YYYY-MM-DD&shift=morning|afternoon&cutoff=HH:MM
//   -> every payment logged in that half-day window, so reception can
//      count their till against what the system says came in.
//
// Deliberately outside /api/accounting — reception runs this every
// shift and doesn't have the accounting password (see middleware.js),
// so this stays unauthenticated like the rest of the staff app.
//
// Query validation and the actual window/totals math live in
// lib/shiftSummary.js, shared with the printable PDF version of this same
// report (app/api/shift-summary/pdf/route.js).

import { supabase } from '@/lib/supabaseClient';
import { validateShiftParams, fetchShiftSummary } from '@/lib/shiftSummary';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const shift = searchParams.get('shift');
  const cutoff = searchParams.get('cutoff') || '14:00';

  const validationError = validateShiftParams(date, shift, cutoff);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data, error } = await fetchShiftSummary(supabase, { date, shift, cutoff });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
