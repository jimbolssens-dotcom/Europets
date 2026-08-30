// app/api/visits/[id]/route.js
// PATCH /api/visits/:id  -> update status; completing a visit sets ended_at
// and also completes its linked appointment, if any.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const VALID_STATUSES = ['in_progress', 'complete'];

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { status } = body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const update = { status };
  if (status === 'complete') {
    update.ended_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('visits')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (status === 'complete' && data.appointment_id) {
    await supabase
      .from('appointments')
      .update({ status: 'complete' })
      .eq('id', data.appointment_id);
  }

  return NextResponse.json(data);
}
