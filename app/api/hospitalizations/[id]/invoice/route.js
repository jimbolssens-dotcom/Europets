// app/api/hospitalizations/[id]/invoice/route.js
// POST /api/hospitalizations/:id/invoice -> find-or-create the invoice
// for this admission's whole billing family (itself, plus anything merged
// into it — see migration 114), then sync it against every current
// treatment item logged across that family's daily worksheets, plus the
// originating consult's own treatment plan if there is one (see
// lib/invoicing.js#gatherInvoiceTreatmentItems) — the same source of truth
// the consult page's own Invoice button uses (app/api/visits/[id]/invoice),
// so whichever page it's opened from shows the same up-to-date invoice.
// Meant to be called every time the Invoice button is pressed, not just
// once — see syncInvoiceTreatmentItems for how a re-sync only adds
// what's new and leaves existing lines (manual edits, removed lines,
// recorded payments) untouched.

import { supabase } from '@/lib/supabaseClient';
import { syncHospitalizationInvoice } from '@/lib/invoicing';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const dogSize = body?.dog_size === 'small' || body?.dog_size === 'large' ? body.dog_size : undefined;

  const result = await syncHospitalizationInvoice(supabase, params.id, { dogSize });
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}
