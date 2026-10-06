// app/api/cattery/[id]/route.js
// GET   -> one cattery booking with its daily logs. Public (GET only, see
//          middleware.js CATTERY_READ_PATTERNS) so the client's cattery care
//          page (app/portal/cattery/[id]) can read it by its UUID link, the
//          same model as the hospitalization portal. A non-staff caller gets
//          the owner view only: the staff-internal booking notes and each
//          day's internal comments are stripped.
// PATCH -> staff: update dates, space, status (check in / check out /
//          cancel), treatments or notes. Moving dates/space re-checks that
//          the space is free.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isStaffRequest } from '@/lib/staffAuth';
import { findSpaceClash, validateBookingInput } from '@/lib/catteryServer';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const EDITABLE = [
  'space_number',
  'date_in',
  'date_out',
  'status',
  'deworming_done',
  'deworming_product',
  'external_parasite_done',
  'external_parasite_product',
  'notes',
];
const STATUSES = ['booked', 'checked_in', 'checked_out', 'cancelled'];

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('cattery_bookings')
    .select('*, patients(id, name, species, patient_number, sex, breed), clients(id, full_name, phone, client_number), cattery_daily_logs(*)')
    .eq('id', params.id)
    .single();
  if (error || !data) return NextResponse.json({ error: 'booking not found' }, { status: 404 });

  data.cattery_daily_logs = (data.cattery_daily_logs || []).sort((a, b) => a.log_date.localeCompare(b.log_date));
  if (!(await isStaffRequest(request))) {
    delete data.notes;
    if (data.clients) data.clients = { id: data.clients.id, full_name: data.clients.full_name };
    data.cattery_daily_logs = data.cattery_daily_logs.map(({ comments, recorded_by, ...owner }) => owner);
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { data: current, error: readError } = await supabaseAdmin.from('cattery_bookings').select('*').eq('id', params.id).single();
  if (readError || !current) return NextResponse.json({ error: 'booking not found' }, { status: 404 });

  const update = { updated_at: new Date().toISOString() };
  for (const key of EDITABLE) if (key in body) update[key] = body[key];
  if ('status' in update && !STATUSES.includes(update.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }
  if ('space_number' in update) update.space_number = Number(update.space_number);

  const next = { ...current, ...update };
  if ('space_number' in body || 'date_in' in body || 'date_out' in body || (update.status && update.status !== 'cancelled' && current.status === 'cancelled')) {
    const invalid = validateBookingInput(next);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    const clash = await findSpaceClash({ spaceNumber: next.space_number, dateIn: next.date_in, dateOut: next.date_out, ignoreId: params.id });
    if (clash) {
      return NextResponse.json(
        { error: `Space ${next.space_number} is already booked for ${clash.patients?.name || 'another cat'} (${clash.date_in} to ${clash.date_out}).` },
        { status: 409 }
      );
    }
  }

  const { data, error } = await supabaseAdmin.from('cattery_bookings').update(update).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
