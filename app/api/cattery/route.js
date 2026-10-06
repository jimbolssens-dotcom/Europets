// app/api/cattery/route.js
// GET  /api/cattery?from=YYYY-MM-DD&to=YYYY-MM-DD -> staff: every non-cancelled
//        booking overlapping that range (the 7-space overview), with its
//        daily logs. ?active=1 instead returns just the checked-in bookings
//        (with today's log), for the Cattery nav alarm.
//      /api/cattery?client_id=X -> a client-app session (or staff) sees that
//        client's own bookings only, newest first — same "public path, route
//        does the real check" split as GET /api/hospitalizations (see
//        middleware.js CLIENT_APP_READ_PATTERNS).
// POST /api/cattery -> staff: create a booking. Refuses one that overlaps
//        another non-cancelled booking in the same space.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isStaffRequest } from '@/lib/staffAuth';
import { getClientSession } from '@/lib/clientAppAuth';
import { catteryToday } from '@/lib/cattery';
import { findSpaceClash, validateBookingInput } from '@/lib/catteryServer';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BOOKING_FIELDS =
  '*, patients(id, name, species, patient_number), clients(id, full_name, phone, client_number), cattery_daily_logs(*)';
const CLIENT_BOOKING_FIELDS =
  'id, patient_id, client_id, space_number, date_in, date_out, status, deworming_done, deworming_product, external_parasite_done, external_parasite_product, patients(id, name, species)';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');
  const staff = await isStaffRequest(request);

  if (clientId) {
    if (!staff) {
      const sessionClientId = await getClientSession(request);
      if (!sessionClientId || sessionClientId !== clientId) {
        return NextResponse.json({ error: 'not authorized' }, { status: 403 });
      }
    }
    const { data, error } = await supabase
      .from('cattery_bookings')
      .select(CLIENT_BOOKING_FIELDS)
      .eq('client_id', clientId)
      .neq('status', 'cancelled')
      .order('date_in', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  }

  if (!staff) return NextResponse.json({ error: 'not authorized' }, { status: 403 });

  if (searchParams.get('active')) {
    const today = catteryToday();
    const { data, error } = await supabase
      .from('cattery_bookings')
      .select('id, status, date_in, date_out, cattery_daily_logs(log_date, weight_kg)')
      .eq('status', 'checked_in')
      .lte('date_in', today)
      .gte('date_out', today);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  }

  const from = searchParams.get('from') || catteryToday();
  const to = searchParams.get('to') || from;
  const { data, error } = await supabase
    .from('cattery_bookings')
    .select(BOOKING_FIELDS)
    .neq('status', 'cancelled')
    .lte('date_in', to)
    .gte('date_out', from)
    .order('date_in', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (!body.patient_id) return NextResponse.json({ error: 'Pick the cat for this booking.' }, { status: 400 });
  const invalid = validateBookingInput(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const clash = await findSpaceClash({ spaceNumber: Number(body.space_number), dateIn: body.date_in, dateOut: body.date_out });
  if (clash) {
    return NextResponse.json(
      { error: `Space ${body.space_number} is already booked for ${clash.patients?.name || 'another cat'} (${clash.date_in} to ${clash.date_out}).` },
      { status: 409 }
    );
  }

  const { data: patient } = await supabaseAdmin.from('patients').select('client_id').eq('id', body.patient_id).single();

  const { data, error } = await supabaseAdmin
    .from('cattery_bookings')
    .insert([
      {
        patient_id: body.patient_id,
        client_id: patient?.client_id || null,
        space_number: Number(body.space_number),
        date_in: body.date_in,
        date_out: body.date_out,
        deworming_done: Boolean(body.deworming_done),
        deworming_product: body.deworming_product || null,
        external_parasite_done: Boolean(body.external_parasite_done),
        external_parasite_product: body.external_parasite_product || null,
        notes: body.notes || null,
      },
    ])
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
