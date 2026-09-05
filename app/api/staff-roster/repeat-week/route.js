// app/api/staff-roster/repeat-week/route.js
// POST { staff_id?, week_start }
//   -> copies every roster entry from the week immediately before
//      week_start (week_start - 7 days) onto week_start itself,
//      shift-for-shift on the matching weekday. With staff_id, only that
//      person's entries are copied — powers "Repeat Last Week" on the
//      mobile My Schedule page (app/mobile/schedule), one tap instead of
//      re-tapping every morning/afternoon by hand. Without staff_id, every
//      staff member's entries are copied at once — powers "Copy Previous
//      Week" on the desktop Staff Roster page (app/(admin)/staff/roster),
//      for rebuilding a whole week's roster from last week's in one go.
//
// Additive, not destructive: existing entries already on the target week
// are left alone (upsert with ignoreDuplicates), so this can't wipe out
// shifts someone already added for that week — it only fills in what's
// missing to match last week.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { defaultRosterCapabilities } from '@/lib/rosterDefaults';

function addDays(dateISO, n) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function POST(request) {
  const body = await request.json();
  const { staff_id, week_start } = body;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(week_start || '')) {
    return NextResponse.json({ error: 'week_start (YYYY-MM-DD) is required' }, { status: 400 });
  }

  const sourceStart = addDays(week_start, -7);
  const sourceEnd = addDays(week_start, -1);

  let query = supabase
    .from('staff_roster_entries')
    .select('staff_id, date, shift')
    .gte('date', sourceStart)
    .lte('date', sourceEnd);
  if (staff_id) query = query.eq('staff_id', staff_id);

  const { data: lastWeek, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!lastWeek || lastWeek.length === 0) {
    return NextResponse.json({ copied: 0 });
  }

  const staffIds = [...new Set(lastWeek.map((e) => e.staff_id))];
  const { data: staffRows, error: staffError } = await supabase
    .from('staff')
    .select('id, full_name')
    .in('id', staffIds);
  if (staffError) {
    return NextResponse.json({ error: staffError.message }, { status: 500 });
  }
  const nameById = new Map((staffRows || []).map((s) => [s.id, s.full_name]));

  const rows = lastWeek.map((entry) => ({
    staff_id: entry.staff_id,
    date: addDays(entry.date, 7),
    shift: entry.shift,
    ...defaultRosterCapabilities(entry.shift, nameById.get(entry.staff_id)),
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
