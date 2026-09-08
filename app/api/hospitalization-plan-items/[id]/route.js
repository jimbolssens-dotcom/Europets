// app/api/hospitalization-plan-items/[id]/route.js
// DELETE /api/hospitalization-plan-items/:id  -> remove a task from the
//        Day Treatment Plan. The worksheet entries it already logged
//        (hospitalization_notes.plan_item_id) are kept, just unlinked
//        (on delete set null — see migrations/076).

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function DELETE(request, { params }) {
  const { error } = await supabase.from('hospitalization_plan_items').delete().eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
