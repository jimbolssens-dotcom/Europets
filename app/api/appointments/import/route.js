// app/api/appointments/import/route.js
// POST /api/appointments/import  { appointments: [{ start_time, duration_minutes?, reason? }, ...] }
//
// Bulk-inserts appointments with no patient/client/room/vet — used to bring
// in an external calendar export (e.g. an Outlook ICS dump) as plain,
// visible bookings the clinic can review and link up manually. Unlike
// POST /api/appointments this skips the room/vet conflict check and staff
// roster block entirely: those rules exist to keep new interactive bookings
// from clashing, and don't apply to importing a batch of historical,
// unassigned calendar entries. See the Appointments page's Import control.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const MAX_BATCH = 2000;

export async function POST(request) {
  const body = await request.json();
  const items = Array.isArray(body.appointments) ? body.appointments : null;

  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'appointments array is required' }, { status: 400 });
  }
  if (items.length > MAX_BATCH) {
    return NextResponse.json({ error: `at most ${MAX_BATCH} appointments per import` }, { status: 400 });
  }

  const rows = [];
  for (const item of items) {
    const startTime = new Date(item.start_time);
    if (Number.isNaN(startTime.getTime())) {
      return NextResponse.json({ error: `invalid start_time: ${item.start_time}` }, { status: 400 });
    }
    const duration = Number(item.duration_minutes) || 15;
    rows.push({
      patient_id: null,
      client_id: null,
      room_id: null,
      vet_id: null,
      type: 'consult',
      start_time: startTime.toISOString(),
      duration_minutes: duration,
      reason: item.reason ? String(item.reason).slice(0, 2000) : null,
    });
  }

  const { data, error } = await supabase.from('appointments').insert(rows).select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ imported: data.length }, { status: 201 });
}
