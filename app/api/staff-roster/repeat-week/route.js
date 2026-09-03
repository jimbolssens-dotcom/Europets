// app/api/staff-roster/repeat-week/route.js
// POST { staff_id, week_start }
//   -> for one staff member, copies every roster entry from the week
//      immediately before week_start (week_start - 7 days) onto week_start
//      itself, shift-for-shift on the matching weekday. Powers "Repeat
//      Last Week" on the mobile My Schedule page (app/mobile/schedule) —
//      one tap instead of re-tapping every morning/afternoon by hand.
//
// Additive, not destructive: existing entries already on the target week
// are left alone (upsert with ignoreDuplicates), so this can't wipe out
// shifts someone already added for that week — it only fills in what's
// missing to match last week.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

function addDays(dateISO, n) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function POST(request) {
  const body = await request.json();
  const { staff_id, week_start } = body;

  if (!staff_id || !/^\d{4}-\d{2}-\d{2}$/.test(week_start || '')) {
    return NextResponse.json(
      { error: 'staff_id and week_start (YYYY-MM-DD) are required' },
      { status: 400 }
    );
  }

  const sourceStart = addDays(week_start, -7);
  const sourceEnd = addDays(week_start, -1);

  const { data: lastWeek, error: fetchError } = await supabase
    .from('staff_roster_entries')
    .select('date, shift')
    .eq('staff_id', staff_id)
    .gte('date', sourceStart)
    .lte('date', sourceEnd);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!lastWeek || lastWeek.length === 0) {
    return NextResponse.json({ copied: 0 });
  }

  const rows = lastWeek.map((entry) => ({
    staff_id,
    date: addDays(entry.date, 7),
    shift: entry.shift,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from('staff_roster_entries')
    .upsert(rows, { onConflict: 'staff_id,date,shift', ignoreDuplicates: true })
    .select('*, staff(full_name, role)');

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ copied: inserted.length, entries: inserted });
}
