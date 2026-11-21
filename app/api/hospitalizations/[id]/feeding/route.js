// app/api/hospitalizations/[id]/feeding/route.js
// GET   -> the stay's food intake: the daily energy target and where it comes
//          from, then one entry per day (force-fed kcal and % of target, the
//          day's best appetite) and per week, from lib/feeding.js. Read by the
//          Feeding tile, the header micro-graph, the full Food intake graph
//          and the owner's portal (GET is public like this stay's /notes, see
//          HOSPITALIZATION_READ_PATTERNS in middleware.js; staff names are left
//          out for non-staff).
// PATCH { energy_target_kcal } -> set the stay's own daily target (empty =
//          back to RER from the latest weight). Staff only.
// PATCH { feed_ramp_start, feeds_per_day } -> start (a date) or stop (null)
//          a 3-day ramp-up, and how many feeds a day. Staff only.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { isStaffRequest } from '@/lib/staffAuth';
import { dailyIntake, weeklyIntake, latestWeight, rerKcal, feedPlan, FEEDING_FOODS, RAMP_DAYS } from '@/lib/feeding';
import { uaeDate } from '@/lib/wallPlanItems';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data: stay, error } = await supabase
    .from('hospitalizations')
    .select('id, admitted_at, discharged_at, status, energy_target_kcal, feed_ramp_start, feeds_per_day, patients(current_weight_kg)')
    .eq('id', params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!stay) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: notes, error: notesError } = await supabase
    .from('hospitalization_notes')
    .select('note_date, created_at, author_id, appetite, weight_kg, feed_kind, feed_ml, feed_food, feed_kcal, staff(full_name)')
    .eq('hospitalization_id', params.id)
    .order('created_at', { ascending: true });
  if (notesError) return NextResponse.json({ error: notesError.message }, { status: 500 });

  const weightKg = latestWeight(notes, stay.patients?.current_weight_kg);
  const custom = Number(stay.energy_target_kcal) > 0 ? Number(stay.energy_target_kcal) : null;
  const targetKcal = custom || rerKcal(weightKg);
  const lastDay = stay.status === 'discharged' && stay.discharged_at ? uaeDate(stay.discharged_at) : uaeDate();
  const rampStart = stay.feed_ramp_start || null;
  const days = dailyIntake(notes, { targetKcal, firstDay: uaeDate(stay.admitted_at), today: lastDay, rampStart });
  const todayEntry = days[days.length - 1];
  const feedsPerDay = stay.feeds_per_day || null;

  const staff = await isStaffRequest(request);
  const nameOf = new Map((notes || []).filter((n) => n.author_id).map((n) => [n.author_id, n.staff?.full_name || null]));
  for (const d of days) {
    for (const f of d.feeds) {
      if (staff) f.by = nameOf.get(f.authorId) || null;
      delete f.authorId;
    }
  }

  return NextResponse.json({
    targetKcal,
    targetSource: custom ? 'custom' : 'rer',
    // A 3-day ramp-up (migration 259): today's share of the target, and
    // that in Recovery Liquid (1 kcal/ml) per day and per feed.
    ramp: rampStart ? { start: rampStart, days: RAMP_DAYS, day: todayEntry?.rampDay || null } : null,
    feedsPerDay,
    todayTargetKcal: todayEntry?.targetKcal ?? targetKcal,
    todayPlan: feedPlan(todayEntry?.targetKcal ?? targetKcal, 'rc_recovery_liquid', feedsPerDay),
    weightKg,
    foods: FEEDING_FOODS,
    days,
    weeks: weeklyIntake(days),
  });
}

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  // Start or stop a 3-day ramp-up: { feed_ramp_start: 'YYYY-MM-DD' | null, feeds_per_day }.
  if ('feed_ramp_start' in body || 'feeds_per_day' in body) {
    const update = {};
    if ('feed_ramp_start' in body) {
      const start = body.feed_ramp_start || null;
      if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) return NextResponse.json({ error: 'feed_ramp_start must be a date' }, { status: 400 });
      update.feed_ramp_start = start;
    }
    if ('feeds_per_day' in body) {
      const n = body.feeds_per_day === null || body.feeds_per_day === '' ? null : Math.round(Number(body.feeds_per_day));
      if (n !== null && !(n >= 1 && n <= 12)) return NextResponse.json({ error: 'Feeds a day: 1 to 12' }, { status: 400 });
      update.feeds_per_day = n;
    }
    const { error } = await supabaseAdmin.from('hospitalizations').update(update).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(update);
  }
  const raw = body.energy_target_kcal;
  const value = raw === null || raw === '' || raw === undefined ? null : Math.round(Number(raw));
  if (value !== null && (!Number.isFinite(value) || value < 10 || value > 10000)) {
    return NextResponse.json({ error: 'Enter a daily target in kcal (10 to 10,000), or leave it empty for RER.' }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from('hospitalizations').update({ energy_target_kcal: value }).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ energy_target_kcal: value });
}
