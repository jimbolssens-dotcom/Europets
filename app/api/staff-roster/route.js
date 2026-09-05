// app/api/staff-roster/route.js
// GET  /api/staff-roster?start=YYYY-MM-DD&end=YYYY-MM-DD[&staff_id=X]
//        -> roster entries (date, shift, staff) in that inclusive range,
//           optionally scoped to one staff member (used by the mobile "My
//           Schedule" page). Used by the admin Staff Roster page for a
//           week's grid.
// POST /api/staff-roster  { staff_id, date, shift }
//        -> add a staff member to a specific date+shift. Idempotent — if
//           they're already on it, returns the existing row instead of
//           erroring, since a double-tap on mobile shouldn't surface an
//           error.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const SHIFTS = ['morning', 'afternoon'];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const staffId = searchParams.get('staff_id');

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end (YYYY-MM-DD) are required' }, { status: 400 });
  }

  let query = supabase
    .from('staff_roster_entries')
    .select('*, staff(full_name, role)')
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true });

  if (staffId) {
    query = query.eq('staff_id', staffId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { staff_id, date, shift, can_consult, can_surgery } = body;

  if (!staff_id || !date || !SHIFTS.includes(shift)) {
    return NextResponse.json(
      { error: 'staff_id, date (YYYY-MM-DD), and shift (morning/afternoon) are required' },
      { status: 400 }
    );
  }

  const row = { staff_id, date, shift };
  if (can_consult !== undefined) row.can_consult = Boolean(can_consult);
  if (can_surgery !== undefined) row.can_surgery = Boolean(can_surgery);

  const { data, error } = await supabase
    .from('staff_roster_entries')
    .insert([row])
    .select('*, staff(full_name, role)')
    .single();

  if (error) {
    if (error.code === '23505') {
      // Already on the roster for this date+shift — return the existing
      // row rather than erroring, so a double-tap is a no-op, not a failure.
      const { data: existing, error: fetchError } = await supabase
        .from('staff_roster_entries')
        .select('*, staff(full_name, role)')
        .eq('staff_id', staff_id)
        .eq('date', date)
        .eq('shift', shift)
        .single();
      if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
      }
      return NextResponse.json(existing);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
