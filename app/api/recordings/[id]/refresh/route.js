// app/api/recordings/[id]/refresh/route.js
// POST /api/recordings/:id/refresh  -> manually re-check a recording's
// AssemblyAI job and resolve it if finished. This is the fallback for when
// the AssemblyAI webhook never arrives, or never finishes processing within
// Vercel's function timeout (a long consult transcript run through two
// sequential/parallel Claude calls plus catalog matching can add up) —
// either way, the recording is otherwise left at "processing" forever with
// no error ever shown, since a hard platform timeout skips right past the
// catch block. Only re-checks a recording still "processing": nothing has
// been written for it yet at that point, so a retry can't double-apply
// anything (see the redelivery guard in ../webhook/route.js for why "done"
// is never retried). The AudioRecorder UI polls this periodically for any
// recording still "processing", plus a manual "Check now" button.

import { supabase } from '@/lib/supabaseClient';
import { resolveRecording } from '@/lib/recordingProcessing';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(request, { params }) {
  const { data: recording, error: fetchError } = await supabase
    .from('recordings')
    .select('*')
    .eq('id', params.id)
    .single();

  if (fetchError || !recording) {
    return NextResponse.json({ error: 'recording not found' }, { status: 404 });
  }
  if (recording.status !== 'processing') {
    return NextResponse.json({ status: recording.status });
  }
  if (!recording.assemblyai_transcript_id) {
    return NextResponse.json({ error: 'no transcription job on record' }, { status: 409 });
  }

  try {
    const result = await resolveRecording(recording);
    return NextResponse.json(result);
  } catch (err) {
    await supabase
      .from('recordings')
      .update({ status: 'error', error_message: err.message })
      .eq('id', recording.id);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
