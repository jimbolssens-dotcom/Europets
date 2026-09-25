// app/api/attachments/[id]/route.js
// PATCH  /api/attachments/:id  -> re-tag a file onto a different entity
//        (e.g. move a photo taken as a general consult photo onto a
//        specific diagnostic once it's clear which test it belongs to).
//        Only entity_type/entity_id change — the file itself stays put in
//        Storage, so its file_path can end up not matching its new
//        entity_type/entity_id prefix; that's cosmetic only, since every
//        read goes through the stored file_path directly, never rebuilds
//        it from entity_type/entity_id.
// DELETE /api/attachments/:id  -> remove a file from Storage and its record

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function PATCH(request, { params }) {
  const { entity_type, entity_id } = await request.json();
  if (!entity_type || !entity_id) {
    return NextResponse.json({ error: 'entity_type and entity_id are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('attachments')
    .update({ entity_type, entity_id })
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { data: attachment, error: fetchError } = await supabase
    .from('attachments')
    .select('file_path')
    .eq('id', params.id)
    .single();

  if (fetchError || !attachment) {
    return NextResponse.json({ error: 'attachment not found' }, { status: 404 });
  }

  await supabaseAdmin.storage.from('consult-files').remove([attachment.file_path]);

  const { error } = await supabaseAdmin.from('attachments').delete().eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
