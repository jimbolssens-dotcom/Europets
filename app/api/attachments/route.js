// app/api/attachments/route.js
// GET  /api/attachments?entity_type=X&entity_id=Y  -> list attachments for an entity
// POST /api/attachments                            -> record a file already uploaded to Storage

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entity_type');
  const entityId = searchParams.get('entity_id');

  if (!entityType || !entityId) {
    return NextResponse.json(
      { error: 'entity_type and entity_id are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('attachments')
    .select('*, staff(full_name)')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true });

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

  const { data, error } = await supabase
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
  return NextResponse.json(data, { status: 201 });
}
