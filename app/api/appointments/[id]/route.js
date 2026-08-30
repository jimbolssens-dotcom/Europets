// app/api/appointments/[id]/route.js
// PATCH /api/appointments/:id  -> update status (booked, checked_in, in_progress, complete, cancelled)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const VALID_STATUSES = ['booked', 'checked_in', 'in_progress', 'complete', 'cancelled'];

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { status } = body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
