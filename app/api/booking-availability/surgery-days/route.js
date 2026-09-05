// app/api/booking-availability/surgery-days/route.js
// GET /api/booking-availability/surgery-days?start=YYYY-MM-DD&end=YYYY-MM-DD
//   -> which dates in that range have at least one doctor on the roster
//      flagged for surgery (morning only — see lib/appointmentBooking.js's
//      isSurgeryType). Used by the "other surgery" request form so a
//      client can see, at a glance, which days are actually likely to
//      work before suggesting a preferred one — without exposing who's
//      on, how many patients are already booked, or anything else about
//      the schedule itself.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: 'start and end (YYYY-MM-DD) are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('staff_roster_entries')
    .select('date, staff!inner(role)')
    .eq('shift', 'morning')
    .eq('can_surgery', true)
    .eq('staff.role', 'vet')
    .gte('date', start)
    .lte('date', end);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dates = [...new Set((data || []).map((r) => r.date))].sort();
  return NextResponse.json({ dates });
}
