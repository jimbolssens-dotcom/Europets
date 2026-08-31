// app/api/attachments/[id]/route.js
// DELETE /api/attachments/:id  -> remove a file from Storage and its record

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function DELETE(request, { params }) {
  const { data: attachment, error: fetchError } = await supabase
    .from('attachments')
    .select('file_path')
    .eq('id', params.id)
    .single();

  if (fetchError || !attachment) {
    return NextResponse.json({ error: 'attachment not found' }, { status: 404 });
  }

  await supabase.storage.from('consult-files').remove([attachment.file_path]);

  const { error } = await supabase.from('attachments').delete().eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
