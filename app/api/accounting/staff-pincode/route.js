// app/api/accounting/staff-pincode/route.js
// GET   -> whether the shared staff PIN is a custom one (from here) or
//          still the STAFF_PINCODE environment variable's default — never
//          the PIN value itself, so it isn't sitting in a network response.
// PATCH -> set a new shared staff PIN (clinic_settings.staff_pincode).
//
// Gated by middleware.js's accounting password check (this whole path is
// under /api/accounting) — the shared PIN is the key to everything else,
// so rotating it needs the stronger password, not just the PIN itself.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET() {
  const { data, error } = await supabase.from('clinic_settings').select('staff_pincode').eq('id', true).maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ isCustom: !!data?.staff_pincode });
}

export async function PATCH(request) {
  const { pincode } = await request.json();
  const trimmed = (pincode || '').trim();
  if (trimmed.length < 4) {
    return NextResponse.json({ error: 'PIN must be at least 4 characters' }, { status: 400 });
  }

  const { error } = await supabase
    .from('clinic_settings')
    .upsert({ id: true, staff_pincode: trimmed, updated_at: new Date().toISOString() }, { onConflict: 'id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
