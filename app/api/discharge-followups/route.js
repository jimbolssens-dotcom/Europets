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
  // Which report each stay has, so the page can link straight to it for a
  // look (or a change) before the message goes out.
  const stayIds = [...new Set((data || []).map((r) => r.hospitalization_id).filter(Boolean))];
  const [{ data: surgical }, { data: dental }] = stayIds.length
    ? await Promise.all([
        supabase.from('surgical_reports').select('hospitalization_id').in('hospitalization_id', stayIds),
        supabase.from('dental_reports').select('hospitalization_id').in('hospitalization_id', stayIds),
      ])
    : [{ data: [] }, { data: [] }];
  const hasSurgical = new Set((surgical || []).map((r) => r.hospitalization_id));
  const hasDental = new Set((dental || []).map((r) => r.hospitalization_id));
  return NextResponse.json(
    (data || []).map((r) => ({
      ...r,
      reports: [hasSurgical.has(r.hospitalization_id) && 'surgical', hasDental.has(r.hospitalization_id) && 'dental'].filter(Boolean),
    }))
  );
}
