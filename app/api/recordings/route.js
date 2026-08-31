// app/api/recordings/route.js
// GET  /api/recordings?entity_type=X&entity_id=Y  -> list recordings for an entity
// POST /api/recordings                            -> record an uploaded audio
//                                                      file and submit it for
//                                                      transcription

import { supabase } from '@/lib/supabaseClient';
import { submitTranscription } from '@/lib/assemblyai';
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
    .from('recordings')
    .select('*')
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
  const { entity_type, entity_id, file_path, file_name } = body;

  if (!entity_type || !entity_id || !file_path) {
    return NextResponse.json(
      { error: 'entity_type, entity_id, and file_path are required' },
      { status: 400 }
    );
  }
  if (!['visit', 'surgical_report'].includes(entity_type)) {
    return NextResponse.json({ error: 'invalid entity_type' }, { status: 400 });
  }

  const { data: recording, error } = await supabase
    .from('recordings')
    .insert([{ entity_type, entity_id, file_path, file_name: file_name || null }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage.from('consult-files').getPublicUrl(file_path);
  const origin = new URL(request.url).origin;

  try {
    const job = await submitTranscription({
      audioUrl: publicUrlData.publicUrl,
      webhookUrl: `${origin}/api/recordings/${recording.id}/webhook`,
    });
    await supabase
      .from('recordings')
      .update({ assemblyai_transcript_id: job.id })
      .eq('id', recording.id);
  } catch (err) {
    await supabase
      .from('recordings')
      .update({ status: 'error', error_message: err.message })
      .eq('id', recording.id);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  return NextResponse.json(recording, { status: 201 });
}
