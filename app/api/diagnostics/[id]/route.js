// app/api/diagnostics/[id]/route.js
// DELETE /api/diagnostics/:id  -> remove a diagnostic entry — also removes
//        its linked treatment_items line, if any, so a deleted test
//        doesn't linger as a billable item nobody remembers adding

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function DELETE(request, { params }) {
  const { data: diagnostic } = await supabase
    .from('diagnostics')
    .select('treatment_item_id')
    .eq('id', params.id)
    .single();

  const { error } = await supabase.from('diagnostics').delete().eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (diagnostic?.treatment_item_id) {
    await supabase.from('treatment_items').delete().eq('id', diagnostic.treatment_item_id);
  }

  return NextResponse.json({ ok: true });
}
