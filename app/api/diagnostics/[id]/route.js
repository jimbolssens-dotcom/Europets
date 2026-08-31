// app/api/diagnostics/[id]/route.js
// DELETE /api/diagnostics/:id  -> remove a diagnostic entry

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function DELETE(request, { params }) {
  const { error } = await supabase.from('diagnostics').delete().eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
