// app/api/recordings/[id]/webhook/route.js
// POST /api/recordings/:id/webhook  -> called by AssemblyAI when a
// transcription job finishes. We don't trust the webhook body's content —
// it only tells us to go re-fetch the transcript (over an authenticated
// call) using the AssemblyAI job id we stored ourselves when submitting it.
//
// On success: summarize the transcript with Claude, then fold that summary
// into consult_notes (for a visit/consult) or surgical_reports.ai_summary
// (for a surgery), and mark the recording done.

import { supabase } from '@/lib/supabaseClient';
import { getTranscript } from '@/lib/assemblyai';
import { summarizeTranscript } from '@/lib/anthropicClient';
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
  if (!recording.assemblyai_transcript_id) {
    return NextResponse.json({ error: 'no transcription job on record' }, { status: 409 });
  }

  try {
    const job = await getTranscript(recording.assemblyai_transcript_id);

    if (job.status === 'error') {
      await supabase
        .from('recordings')
        .update({ status: 'error', error_message: job.error || 'Transcription failed' })
        .eq('id', recording.id);
      return NextResponse.json({ ok: true });
    }
    if (job.status !== 'completed') {
      // Webhook fired for an intermediate state — nothing to do yet.
      return NextResponse.json({ ok: true });
    }

    const transcript = job.text || '';
    const summary = transcript.trim()
      ? await summarizeTranscript(transcript, recording.entity_type)
      : '(No speech detected in recording.)';

    await supabase
      .from('recordings')
      .update({ status: 'done', transcript, summary })
      .eq('id', recording.id);

    if (recording.entity_type === 'visit') {
      await supabase.from('consult_notes').insert([
        {
          visit_id: recording.entity_id,
          note_text: `AI summary of recorded consult:\n\n${summary}`,
          ai_summary: summary,
        },
      ]);
    } else if (recording.entity_type === 'surgical_report') {
      await supabase
        .from('surgical_reports')
        .update({ ai_summary: summary })
        .eq('id', recording.entity_id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    await supabase
      .from('recordings')
      .update({ status: 'error', error_message: err.message })
      .eq('id', recording.id);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
