// app/api/staff/[id]/daily-log/route.js
// GET ?date=YYYY-MM-DD -> a consolidated, on-demand log of everything this
// staff member logged that day, across every attributable table (see
// lib/dailyLog.js for exactly which). Nothing is stored — re-derived fresh
// on every request, the same "generate when asked" spirit as the shift
// tally.

import { supabase } from '@/lib/supabaseClient';
import { fetchStaffDailyLog, validateDailyLogParams } from '@/lib/dailyLog';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  const validationError = validateDailyLogParams(date);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data, error } = await fetchStaffDailyLog(supabase, { staffId: params.id, date });
  if (error) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
  return NextResponse.json(data);
}
