// app/api/staff-roster/no-shift-confirmation/route.js
// GET  /api/staff-roster/no-shift-confirmation?staff_id=X&week_start=YYYY-MM-DD
//        -> { confirmed: boolean } — whether staff_id has already
//           confirmed they have no shifts for the week starting week_start.
// POST /api/staff-roster/no-shift-confirmation  { staff_id, week_start }
//        -> records that confirmation (idempotent — confirming twice for
//           the same week is a no-op, not an error). See
//           MobileRosterGate.jsx: this is its deliberate bypass, for a
//           staff member who genuinely has nothing on next week rather
//           than one who just hasn't logged it yet — the gate can't tell
//           those apart from an empty staff_roster_entries alone.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const staffId = searchParams.get('staff_id');
  const weekStart = searchParams.get('week_start');

  if (!staffId || !weekStart) {
    return NextResponse.json({ error: 'staff_id and week_start (YYYY-MM-DD) are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('staff_roster_no_shift_confirmations')
    .select('id')
    .eq('staff_id', staffId)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ confirmed: Boolean(data) });
}

export async function POST(request) {
  const body = await request.json();
  const { staff_id, week_start } = body;

  if (!staff_id || !week_start) {
    return NextResponse.json({ error: 'staff_id and week_start (YYYY-MM-DD) are required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('staff_roster_no_shift_confirmations')
    .upsert([{ staff_id, week_start }], { onConflict: 'staff_id,week_start' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ confirmed: true }, { status: 201 });
}
