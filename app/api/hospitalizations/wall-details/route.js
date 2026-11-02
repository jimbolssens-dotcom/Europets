// app/api/hospitalizations/wall-details/route.js
// GET /api/hospitalizations/wall-details?ids=a,b,c&date=YYYY-MM-DD
//   -> { [hospitalization_id]: { planItems, todayNotes } }
//
// What the hospital and day-procedure wall screens need for every patient
// on them, in one request. They used to make two requests per patient on
// every refresh, and the notes one fetched each patient's whole stay history
// with all its treatment items, only to keep today's notes that ticked a plan
// task. That was the biggest single load behind Supabase's Disk IO warning
// (2 Nov). Staff-only, like the per-stay routes (middleware.js).

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MAX_IDS = 100;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ids = [...new Set((searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean))].slice(0, MAX_IDS);
  const date = searchParams.get('date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return NextResponse.json({ error: 'date (YYYY-MM-DD) is required' }, { status: 400 });
  }
  if (ids.length === 0) return NextResponse.json({});

  const [planRes, notesRes] = await Promise.all([
    supabase
      .from('hospitalization_plan_items')
      .select('*, goods_services(name)')
      .in('hospitalization_id', ids)
      .order('created_at', { ascending: true }),
    supabase
      .from('hospitalization_notes')
      .select('*, staff(full_name)')
      .in('hospitalization_id', ids)
      .eq('note_date', date)
      .order('created_at', { ascending: false }),
  ]);
  if (planRes.error || notesRes.error) {
    return NextResponse.json({ error: (planRes.error || notesRes.error).message }, { status: 500 });
  }

  const out = Object.fromEntries(ids.map((id) => [id, { planItems: [], todayNotes: [] }]));
  for (const item of planRes.data || []) out[item.hospitalization_id]?.planItems.push(item);
  for (const note of notesRes.data || []) {
    if (note.plan_item_ids?.length > 0) out[note.hospitalization_id]?.todayNotes.push(note);
  }
  return NextResponse.json(out);
}
