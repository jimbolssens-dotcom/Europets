// app/api/patient-history-files/[id]/route.js
// Staff only (not in middleware.js's public patterns).
// PATCH { title?, category?, document_date?, share_with_owner? }
// DELETE -> removes the record and its file.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { HISTORY_BUCKET, HISTORY_CATEGORIES } from '@/lib/patientHistoryFiles';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const updates = {};
  if ('title' in body) updates.title = (body.title || '').trim() || null;
  if ('category' in body && HISTORY_CATEGORIES.some((c) => c.value === body.category)) updates.category = body.category;
  if ('document_date' in body) updates.document_date = body.document_date || null;
  if ('share_with_owner' in body) updates.share_with_owner = !!body.share_with_owner;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('patient_history_files')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { data: row } = await supabaseAdmin
    .from('patient_history_files')
    .select('id, file_path')
    .eq('id', params.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { error } = await supabaseAdmin.from('patient_history_files').delete().eq('id', row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabaseAdmin.storage.from(HISTORY_BUCKET).remove([row.file_path]);
  return NextResponse.json({ deleted: true });
}
