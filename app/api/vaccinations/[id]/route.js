// app/api/vaccinations/[id]/route.js
// PATCH  /api/vaccinations/:id  -> edit a record, or mark/clear its reminder
// DELETE /api/vaccinations/:id  -> remove a mistaken entry

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const EDITABLE_FIELDS = ['date_given', 'next_due_date', 'batch_number', 'administered_by', 'notes'];

export async function PATCH(request, { params }) {
  const body = await request.json();
  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field];
  }
  // Set by the "remind" button on the due list — one click both drafts the
  // WhatsApp/email message and marks it handled, so the list stops nagging
  // about the same due date. clear_reminder undoes that if needed.
  if (body.mark_reminded) update.reminder_sent_at = new Date().toISOString();
  if (body.clear_reminder) update.reminder_sent_at = null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('vaccinations')
    .update(update)
    .eq('id', params.id)
    .select('*, staff(full_name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { error } = await supabase.from('vaccinations').delete().eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
