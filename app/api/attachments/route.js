// app/api/attachments/route.js
// GET  /api/attachments?entity_type=X&entity_id=Y  -> list attachments for an entity.
//      For a consult ('visit') or a stay/day procedure ('hospitalization'),
//      the whole linked case's photos (lib/caseFamily.js), so a photo taken
//      on any of them shows on all of them and on the client's live updates
//      page. Each row keeps its own entity_type/entity_id.
// GET  /api/attachments?entity_type=X&entity_ids=a,b,c -> the same for many
//      entities at once (every worksheet entry of a stay): one request
//      instead of one per entry (app/_components/NoteAttachments.jsx).
// POST /api/attachments                            -> record a file already uploaded to Storage

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { caseFamily } from '@/lib/caseFamily';
import { copyNotePhotosToTests } from '@/lib/worksheetTests';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entity_type');
  const entityId = searchParams.get('entity_id');
  const entityIds = searchParams.get('entity_ids');

  if (entityType && entityIds != null && entityType !== 'visit' && entityType !== 'hospitalization') {
    const ids = [...new Set(entityIds.split(',').filter(Boolean))];
    if (ids.length > 400 || !ids.every((x) => /^[0-9a-f-]{36}$/i.test(x))) {
      return NextResponse.json({ error: 'entity_ids must be up to 400 ids' }, { status: 400 });
    }
    if (!ids.length) return NextResponse.json([]);
    const rows = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabase
        .from('attachments')
        .select('*, staff(full_name)')
        .eq('entity_type', entityType)
        .in('entity_id', ids.slice(i, i + 100))
        .order('created_at', { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      rows.push(...(data || []));
    }
    return NextResponse.json(rows);
  }

  if (!entityType || !entityId) {
    return NextResponse.json(
      { error: 'entity_type and entity_id are required' },
      { status: 400 }
    );
  }

  if (!/^[0-9a-f-]{36}$/i.test(entityId)) {
    return NextResponse.json({ error: 'entity_id must be an id' }, { status: 400 });
  }
  let query = supabase.from('attachments').select('*, staff(full_name)');
  if (entityType === 'visit' || entityType === 'hospitalization') {
    const family = await caseFamily(supabase, entityType === 'visit' ? { visitId: entityId } : { hospitalizationId: entityId });
    const parts = [];
    if (family.visitIds.length) parts.push(`and(entity_type.eq.visit,entity_id.in.(${family.visitIds.join(',')}))`);
    if (family.hospitalizationIds.length) parts.push(`and(entity_type.eq.hospitalization,entity_id.in.(${family.hospitalizationIds.join(',')}))`);
    query = query.or(parts.join(','));
  } else {
    query = query.eq('entity_type', entityType).eq('entity_id', entityId);
  }
  const { data, error } = await query.order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { entity_type, entity_id, file_path, file_name, content_type, uploaded_by } = body;

  if (!entity_type || !entity_id || !file_path) {
    return NextResponse.json(
      { error: 'entity_type, entity_id, and file_path are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('attachments')
    .insert([
      {
        entity_type,
        entity_id,
        file_path,
        file_name: file_name || null,
        content_type: content_type || null,
        uploaded_by: uploaded_by || null,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // A photo on a worksheet entry that logged a test also goes on that test
  // (Reports), see lib/worksheetTests.js.
  if (entity_type === 'hospitalization_note') await copyNotePhotosToTests(supabaseAdmin, entity_id);
  return NextResponse.json(data, { status: 201 });
}
