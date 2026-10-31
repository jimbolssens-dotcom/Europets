// app/api/dose-guidelines/route.js
// GET  /api/dose-guidelines  -> every guideline dose (migration 237), with
//                               its catalog item's name; the treatment
//                               screens use the approved ones to fill in
//                               and check doses (lib/doseGuidelines.js)
// POST /api/dose-guidelines  -> add one { goods_service_id, species, ...,
//                               approved_by } (approved as it's saved)
// Staff only (middleware.js). The table is server-only (RLS on, no policy).

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { cleanGuideline } from '@/lib/doseGuidelinesServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('dose_guidelines')
    .select('*, goods_services(name, active)')
    .order('created_at')
    .limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { row, error: invalid } = cleanGuideline(body, { requireItem: true });
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from('dose_guidelines')
    .insert([{ ...row, approved_at: new Date().toISOString(), approved_by: body.approved_by || null }])
    .select('*, goods_services(name, active)')
    .single();
  if (error) {
    const clash = error.code === '23505';
    return NextResponse.json(
      { error: clash ? 'This medicine already has a guideline for that species (and variant).' : error.message },
      { status: clash ? 409 : 500 }
    );
  }
  return NextResponse.json(data, { status: 201 });
}
