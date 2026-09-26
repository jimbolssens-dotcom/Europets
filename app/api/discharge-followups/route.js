// app/api/discharge-followups/route.js
// GET /api/discharge-followups -> the Follow-ups page's full list, newest
// due first. Runs evaluateDueFollowups() first (see lib/dischargeFollowups.js)
// so opening this page IS the trigger that promotes anything now due into
// either "ready_for_review" (with a drafted message) or "skipped" (with a
// reason) — this app has no cron yet, so a staff page load stands in for
// one. Cheap and idempotent to call on every load: a row already past
// 'scheduled' is left alone.

import { supabase } from '@/lib/supabaseClient';
import { evaluateDueFollowups } from '@/lib/dischargeFollowups';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  await evaluateDueFollowups();

  const { data, error } = await supabase
    .from('discharge_followups')
    .select(
      '*, patients(name, patient_number, deceased, rehomed), clients(full_name, client_number, phone), staff:vet_id(full_name)'
    )
    .order('due_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
