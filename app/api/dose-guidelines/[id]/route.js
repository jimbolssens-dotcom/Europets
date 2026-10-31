// app/api/dose-guidelines/[id]/route.js
// PATCH  -> change a guideline dose; saving it approves it again, under
//           the name given (approved_by), so the page shows who set each one
// DELETE -> remove it (the medicine then gets no pre-filled dose)
// Staff only (middleware.js).

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { cleanGuideline } from '@/lib/doseGuidelinesServer';

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { row, error: invalid } = cleanGuideline(body, { requireItem: false });
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from('dose_guidelines')
    .update({ ...row, approved_at: new Date().toISOString(), approved_by: body.approved_by || null, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('*, goods_services(name, active)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { error } = await supabaseAdmin.from('dose_guidelines').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
