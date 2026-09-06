// app/api/recordings/[id]/webhook/route.js
// POST /api/recordings/:id/webhook  -> called by AssemblyAI when a
// transcription job finishes. We don't trust the webhook body's content —
// it only tells us to go re-fetch the transcript (over an authenticated
// call) using the AssemblyAI job id we stored ourselves when submitting it.
// The actual processing (summarize, extract structured fields, write them
// into the visit/report, mark done) lives in lib/recordingProcessing.js,
// shared with the [id]/refresh route below — that route is the fallback
// for when this webhook never arrives, or never finishes in time.
//
// AssemblyAI may redeliver this webhook (e.g. on a retry) — recording.status
// is checked up front so a redelivery is a no-op instead of double-writing
// the visit record or, worse, double-billing by re-adding the same
// diagnostics/treatments a second time.

import { supabase } from '@/lib/supabaseClient';
import { resolveRecording } from '@/lib/recordingProcessing';
import { NextResponse } from 'next/server';

// This route makes two Claude calls (summarizeTranscript and
// extractConsultFields, run in parallel — see recordingProcessing.js)
// plus several Supabase round-trips for catalog matching — easily past
// Vercel's default serverless timeout, especially with Opus 5's adaptive
// thinking on the structured-extraction call. Other routes that call
// Claude in this app (voice-to-text, scan-id) already set this for the
// same reason.
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
  if (recording.status === 'done') {
    // Already processed — a redelivered webhook is a no-op, not a re-run.
    return NextResponse.json({ ok: true });
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
