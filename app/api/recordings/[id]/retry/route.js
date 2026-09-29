// app/api/recordings/[id]/retry/route.js
// POST /api/recordings/:id/retry  -> re-submits a recording that failed
// before ever getting an AssemblyAI transcription job (a bad/expired
// ASSEMBLYAI_API_KEY, an AssemblyAI-side outage, ...) — status 'error'
// with no assemblyai_transcript_id, which the /refresh route can't help
// with (it only re-checks a job still 'processing'). The raw audio is
// still sitting in Storage at this point (only deleted once a recording
// actually finishes — see AudioRecorder.jsx's cleanup), so this doesn't
// need staff to record it again: same file, a fresh submission attempt.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { submitTranscription } from '@/lib/assemblyai';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const { data: recording, error: fetchError } = await supabase
    .from('recordings')
    .select('*')
    .eq('id', params.id)
    .single();

  if (fetchError || !recording) {
    return NextResponse.json({ error: 'recording not found' }, { status: 404 });
  }
  if (recording.status !== 'error') {
    return NextResponse.json({ error: `only a failed recording can be retried (this one is ${recording.status})` }, { status: 409 });
  }
  if (!recording.file_path) {
    return NextResponse.json({ error: 'the original audio is no longer available — record it again' }, { status: 410 });
  }

  const { data: publicUrlData } = supabase.storage.from('consult-files').getPublicUrl(recording.file_path);
  const origin = new URL(request.url).origin;

  try {
    const job = await submitTranscription({
      audioUrl: publicUrlData.publicUrl,
      webhookUrl: `${origin}/api/recordings/${recording.id}/webhook`,
    });
    const { data, error } = await supabaseAdmin
      .from('recordings')
      .update({ assemblyai_transcript_id: job.id, status: 'processing', error_message: null })
      .eq('id', recording.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    await supabaseAdmin.from('recordings').update({ error_message: err.message }).eq('id', recording.id);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
