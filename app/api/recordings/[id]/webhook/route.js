// app/api/recordings/[id]/webhook/route.js
// POST /api/recordings/:id/webhook  -> called by AssemblyAI when a
// transcription job finishes. We don't trust the webhook body's content —
// it only tells us to go re-fetch the transcript (over an authenticated
// call) using the AssemblyAI job id we stored ourselves when submitting it.
//
// On success: for a consult recording, break the transcript down into the
// Vitals & Exam fields (anamnesis/findings/diagnosis/prognosis/
// treatment_notes) and write those onto the visit directly — a field
// already filled in by the vet is appended to (with a timestamp marker)
// rather than overwritten, so nothing typed before the recording finished
// is ever lost. Diagnostic tests and treatments/medications mentioned as
// actually ordered/given are matched against the goods_services catalog
// and added to the Diagnostics/Treatment Plan lists directly, the same as
// picking them from CatalogPicker would. For a surgery recording, fold a
// freeform summary into surgical_reports.ai_summary as before. Either way,
// mark the recording done.
//
// AssemblyAI may redeliver this webhook (e.g. on a retry) — recording.status
// is checked up front so a redelivery is a no-op instead of double-writing
// the visit record or, worse, double-billing by re-adding the same
// diagnostics/treatments a second time.

import { supabase } from '@/lib/supabaseClient';
import { getTranscript } from '@/lib/assemblyai';
import { summarizeTranscript, extractConsultFields } from '@/lib/anthropicClient';
import { matchCatalogItem } from '@/lib/catalogMatch';
import { NextResponse } from 'next/server';

// This route makes two sequential Claude calls (summarizeTranscript, then
// extractConsultFields) plus several Supabase round-trips for catalog
// matching — easily past Vercel's default serverless timeout, especially
// with Opus 5's adaptive thinking on the structured-extraction call. Other
// routes that call Claude in this app (voice-to-text, scan-id) already set
// this for the same reason.
export const maxDuration = 60;

const CONSULT_RECORD_FIELDS = ['anamnesis', 'findings', 'diagnosis', 'prognosis', 'treatment_notes'];

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

      if (fields.diagnostics_ordered?.length) {
        const { data: tests } = await supabase
          .from('goods_services')
          .select('id, name')
          .eq('main_category', 'test')
          .eq('active', true);

        for (const name of fields.diagnostics_ordered) {
          const match = matchCatalogItem(name, tests || []);
          if (!match) continue;

          const { data: treatmentItem, error: itemError } = await supabase
            .from('treatment_items')
            .insert([{ visit_id: recording.entity_id, goods_service_id: match.id, quantity: 1 }])
            .select()
            .single();
          if (itemError) continue;

          const { error: diagError } = await supabase
            .from('diagnostics')
            .insert([{ visit_id: recording.entity_id, goods_service_id: match.id, treatment_item_id: treatmentItem.id }]);
          if (diagError) {
            await supabase.from('treatment_items').delete().eq('id', treatmentItem.id);
          }
        }
      }

      if (fields.treatments_given?.length) {
        const { data: items } = await supabase
          .from('goods_services')
          .select('id, name')
          .in('main_category', ['product', 'service'])
          .eq('active', true);

        for (const t of fields.treatments_given) {
          const match = matchCatalogItem(t.name, items || []);
          if (!match) continue;

          await supabase.from('treatment_items').insert([
            {
              visit_id: recording.entity_id,
              goods_service_id: match.id,
              instructions: t.instructions || null,
              quantity: t.quantity || 1,
            },
          ]);
        }
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
