// app/api/consent-forms/[id]/route.js
// DELETE /api/consent-forms/:id  -> remove a signed consent form record.
// The signed PDF is generated on demand from form_text (see .../pdf), not
// stored as a file, so there's nothing else to clean up.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function DELETE(request, { params }) {
  const { error } = await supabase.from('consent_forms').delete().eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
