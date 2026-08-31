// app/api/recordings/[id]/route.js
// DELETE /api/recordings/:id  -> remove a recording from Storage and its record

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function DELETE(request, { params }) {
  const { data: recording, error: fetchError } = await supabase
    .from('recordings')
    .select('file_path')
    .eq('id', params.id)
    .single();

  if (fetchError || !recording) {
    return NextResponse.json({ error: 'recording not found' }, { status: 404 });
  }

  await supabase.storage.from('consult-files').remove([recording.file_path]);

  const { error } = await supabase.from('recordings').delete().eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
