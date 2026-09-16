// app/api/shift-summary/pdf/route.js
// GET /api/shift-summary/pdf?date=YYYY-MM-DD&shift=morning|afternoon&cutoff=HH:MM
//   -> the same shift tally as GET /api/shift-summary, laid out as a
//      printable report (see lib/shiftTallyPdf.js) — reception's "Print"
//      button on the Shift Tally page. Same window/totals math as the
//      JSON route, shared via lib/shiftSummary.js so they can't drift.
//
// Triggered from inside the staff app (not linked out to a client like
// the tax-invoice/statement PDFs), so this stays behind the normal staff
// gate rather than being added to middleware.js's PUBLIC_PATTERNS.

import { supabase } from '@/lib/supabaseClient';
import { validateShiftParams, fetchShiftSummary } from '@/lib/shiftSummary';
import { buildShiftTallyPdf } from '@/lib/shiftTallyPdf';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const shift = searchParams.get('shift');
  const cutoff = searchParams.get('cutoff') || '14:00';

  const validationError = validateShiftParams(date, shift, cutoff);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const [{ data: summary, error }, { data: clinic }] = await Promise.all([
    fetchShiftSummary(supabase, { date, shift, cutoff }),
    supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pdfBytes = await buildShiftTallyPdf({ date, shift, cutoff, summary, clinic });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="shift-tally-${date}-${shift}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
