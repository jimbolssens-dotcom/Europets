// app/api/clinic-settings/route.js
// GET   /api/clinic-settings  -> the clinic's identity for tax invoices
// PATCH /api/clinic-settings  -> edit it (legal_name, trn, address, phone, email)
//
// Singleton row (id is always `true`) — there's only ever one clinic. Both
// handlers create the row on the fly if it's missing (e.g. the migration's
// seed insert wasn't run), rather than erroring on "no rows found".

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET() {
  const { data, error } = await supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (data) {
    return NextResponse.json(data);
  }

  const { data: created, error: createError } = await supabase
    .from('clinic_settings')
    .insert([{ id: true }])
    .select()
    .single();

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }
  return NextResponse.json(created);
}

export async function PATCH(request) {
  const body = await request.json();
  const { legal_name, trn, address, phone, email } = body;

  const update = { id: true, updated_at: new Date().toISOString() };
  if (legal_name !== undefined) update.legal_name = legal_name;
  if (trn !== undefined) update.trn = trn || null;
  if (address !== undefined) update.address = address || null;
  if (phone !== undefined) update.phone = phone || null;
  if (email !== undefined) update.email = email || null;

  const { data, error } = await supabase
    .from('clinic_settings')
    .upsert(update, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
