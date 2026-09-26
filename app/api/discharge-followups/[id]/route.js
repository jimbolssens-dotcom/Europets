// app/api/discharge-followups/[id]/route.js
// PATCH /api/discharge-followups/:id -> body { action: 'send', message } |
//                                       { action: 'skip', reason? } |
//                                       { action: 'edit', message }
// 'send' is the only action that actually reaches WhatsApp — it uses
// whatever message text is passed (the staff-edited draft), not
// necessarily what was originally generated, via the same
// sendDischargeFollowup() that DISCHARGE_FOLLOWUP_AUTOSEND will call
// automatically once this is trusted enough to skip the review step.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendDischargeFollowup } from '@/lib/dischargeFollowups';
import { NextResponse } from 'next/server';

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));

  const { data: row, error } = await supabase
    .from('discharge_followups')
    .select('*, clients(full_name, phone)')
    .eq('id', params.id)
    .single();
  if (error || !row) {
    return NextResponse.json({ error: 'follow-up not found' }, { status: 404 });
  }

  if (body.action === 'skip') {
    await supabaseAdmin
      .from('discharge_followups')
      .update({ status: 'skipped', skip_reason: body.reason || 'Skipped by staff' })
      .eq('id', params.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'edit') {
    if (typeof body.message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }
    await supabaseAdmin.from('discharge_followups').update({ message_draft: body.message }).eq('id', params.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'send') {
    const message = (body.message || '').trim();
    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }
    try {
      await sendDischargeFollowup(row, message, body.staff_id || null);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `unknown action "${body.action}"` }, { status: 400 });
}
