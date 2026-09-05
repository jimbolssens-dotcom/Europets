// app/api/clinic-settings/route.js
// GET   /api/clinic-settings  -> the clinic's identity for tax invoices, plus
//                                 the medication administration fees (see
//                                 lib/invoicing.js)
// PATCH /api/clinic-settings  -> edit it (legal_name, trn, address, phone,
//                                 phone2, email, dispensing_fee,
//                                 sc_injection_fee, im_injection_fee,
//                                 surgical_postop_baseline, dental_postop_baseline,
//                                 booking_morning_start, booking_morning_end,
//                                 booking_afternoon_start, booking_afternoon_end)
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
  const {
    legal_name,
    trn,
    address,
    phone,
    phone2,
    email,
    dispensing_fee,
    sc_injection_fee,
    im_injection_fee,
    surgical_postop_baseline,
    dental_postop_baseline,
    booking_morning_start,
    booking_morning_end,
    booking_afternoon_start,
    booking_afternoon_end,
  } = body;

  const update = { id: true, updated_at: new Date().toISOString() };
  if (legal_name !== undefined) update.legal_name = legal_name;
  if (trn !== undefined) update.trn = trn || null;
  if (address !== undefined) update.address = address || null;
  if (phone !== undefined) update.phone = phone || null;
  if (phone2 !== undefined) update.phone2 = phone2 || null;
  if (email !== undefined) update.email = email || null;
  if (dispensing_fee !== undefined) update.dispensing_fee = Number(dispensing_fee) || 0;
  if (sc_injection_fee !== undefined) update.sc_injection_fee = Number(sc_injection_fee) || 0;
  if (im_injection_fee !== undefined) update.im_injection_fee = Number(im_injection_fee) || 0;
  if (surgical_postop_baseline !== undefined) update.surgical_postop_baseline = surgical_postop_baseline || null;
  if (dental_postop_baseline !== undefined) update.dental_postop_baseline = dental_postop_baseline || null;
  if (booking_morning_start !== undefined) update.booking_morning_start = booking_morning_start;
  if (booking_morning_end !== undefined) update.booking_morning_end = booking_morning_end;
  if (booking_afternoon_start !== undefined) update.booking_afternoon_start = booking_afternoon_start;
  if (booking_afternoon_end !== undefined) update.booking_afternoon_end = booking_afternoon_end;

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
