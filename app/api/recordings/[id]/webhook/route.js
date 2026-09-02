// app/api/recordings/[id]/webhook/route.js
// POST /api/recordings/:id/webhook  -> called by AssemblyAI when a
// transcription job finishes. We don't trust the webhook body's content —
// it only tells us to go re-fetch the transcript (over an authenticated
// call) using the AssemblyAI job id we stored ourselves when submitting it.
//
// On success: for a consult recording, break the transcript down into the
// Vitals & Exam fields (anamnesis/findings/prognosis/treatment_notes) and
// write those onto the visit directly — a field already filled in by the
// vet is appended to (with a timestamp marker) rather than overwritten, so
// nothing typed before the recording finished is ever lost. For a surgery
// recording, fold a freeform summary into surgical_reports.ai_summary as
// before. Either way, mark the recording done.

import { supabase } from '@/lib/supabaseClient';
import { getTranscript } from '@/lib/assemblyai';
import { summarizeTranscript, extractConsultFields } from '@/lib/anthropicClient';
import { NextResponse } from 'next/server';

const CONSULT_RECORD_FIELDS = ['anamnesis', 'findings', 'prognosis', 'treatment_notes'];

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
    const hasSpeech = transcript.trim().length > 0;
    const summary = hasSpeech
      ? await summarizeTranscript(transcript, recording.entity_type)
      : '(No speech detected in recording.)';

    await supabase
      .from('recordings')
      .update({ status: 'done', transcript, summary })
      .eq('id', recording.id);

    if (recording.entity_type === 'visit' && hasSpeech) {
      const fields = await extractConsultFields(transcript);

      const { data: visit } = await supabase
        .from('visits')
        .select(CONSULT_RECORD_FIELDS.join(', '))
        .eq('id', recording.entity_id)
        .single();

      const stamp = `[AI recording, ${new Date().toLocaleString()}]`;
      const update = {};
      for (const field of CONSULT_RECORD_FIELDS) {
        const extracted = fields[field]?.trim();
        if (!extracted) continue;
        const existing = visit?.[field]?.trim();
        update[field] = existing ? `${existing}\n\n${stamp}\n${extracted}` : extracted;
      }

      if (Object.keys(update).length > 0) {
        await supabase.from('visits').update(update).eq('id', recording.entity_id);
      }
    } else if (recording.entity_type === 'surgical_report' && hasSpeech) {
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
