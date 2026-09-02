// app/api/patient-alerts/[id]/route.js
// DELETE /api/patient-alerts/:id  -> remove a long-term note (e.g. entered
//        by mistake, or no longer relevant)

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function DELETE(request, { params }) {
  const { error } = await supabase.from('patient_alerts').delete().eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
