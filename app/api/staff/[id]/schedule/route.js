// app/api/staff/[id]/schedule/route.js
// GET /api/staff/:id/schedule -> the staff member's weekly schedule (up to
//                                 14 rows: 7 weekdays x morning/afternoon;
//                                 fewer if it hasn't been fully set)
// PUT /api/staff/:id/schedule -> replace the whole week in one call

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const SHIFTS = ['morning', 'afternoon'];

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('staff_schedules')
    .select('weekday, shift, expected')
    .eq('staff_id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function PUT(request, { params }) {
  const body = await request.json();
  const { schedule } = body;

  if (!Array.isArray(schedule)) {
    return NextResponse.json({ error: 'schedule must be an array' }, { status: 400 });
  }
  for (const entry of schedule) {
    if (
      !Number.isInteger(entry.weekday) ||
      entry.weekday < 0 ||
      entry.weekday > 6 ||
      !SHIFTS.includes(entry.shift) ||
      typeof entry.expected !== 'boolean'
    ) {
      return NextResponse.json(
        { error: 'each schedule entry needs an integer weekday (0-6), a morning/afternoon shift, and a boolean expected' },
        { status: 400 }
      );
    }
  }

  const rows = schedule.map((entry) => ({
    staff_id: params.id,
    weekday: entry.weekday,
    shift: entry.shift,
    expected: entry.expected,
  }));

  const { data, error } = await supabase
    .from('staff_schedules')
    .upsert(rows, { onConflict: 'staff_id,weekday,shift' })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
