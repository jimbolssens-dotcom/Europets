// app/api/recordings/[id]/webhook/route.js
// POST /api/recordings/:id/webhook  -> called by AssemblyAI when a
// transcription job finishes. We don't trust the webhook body's content —
// it only tells us to go re-fetch the transcript (over an authenticated
// call) using the AssemblyAI job id we stored ourselves when submitting it.
//
// On success: for a consult recording, break the transcript down into the
// Vitals & Exam fields — weight/temperature/body condition score plus
// anamnesis/findings/diagnosis/prognosis/treatment_notes — and write those
// onto the visit directly. A text field already filled in by the vet is
// appended to (with a timestamp marker) rather than overwritten; a numeric
// vital is only set if it's still empty, since there's no sensible way to
// "append" to a number. Diagnostic tests and treatments/medications
// mentioned as actually ordered/given are matched against the
// goods_services catalog (the extraction prompt is given the catalog's
// own names so the model echoes them verbatim) and added to the
// Diagnostics/Treatment Plan lists directly, the same as picking them
// from CatalogPicker would. For a surgery recording, fold a freeform
// summary into surgical_reports.ai_summary as before. Either way, mark
// the recording done.
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

const CONSULT_TEXT_FIELDS = ['anamnesis', 'findings', 'diagnosis', 'prognosis', 'treatment_notes'];
const CONSULT_NUMERIC_FIELDS = ['weight_kg', 'temperature_c', 'body_condition_score'];

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
      // Fetch the catalog first — the extraction prompt is grounded with
      // these exact names so the model echoes them verbatim instead of
      // paraphrasing (e.g. "Anaemia PCR panel" vs. the catalog's "PCR
      // Anemia panel"), which a fuzzy match after the fact would miss.
      const [{ data: tests }, { data: productsAndServices }] = await Promise.all([
        supabase.from('goods_services').select('id, name').eq('main_category', 'test').eq('active', true),
        supabase.from('goods_services').select('id, name').in('main_category', ['product', 'service']).eq('active', true),
      ]);

      const fields = await extractConsultFields(transcript, {
        testNames: (tests || []).map((t) => t.name),
        productServiceNames: (productsAndServices || []).map((t) => t.name),
      });

      const { data: visit } = await supabase
        .from('visits')
        .select([...CONSULT_TEXT_FIELDS, ...CONSULT_NUMERIC_FIELDS, 'patient_id'].join(', '))
        .eq('id', recording.entity_id)
        .single();

      const stamp = `[AI recording, ${new Date().toLocaleString()}]`;
      const update = {};
      for (const field of CONSULT_TEXT_FIELDS) {
        const extracted = fields[field]?.trim();
        if (!extracted) continue;
        const existing = visit?.[field]?.trim();
        update[field] = existing ? `${existing}\n\n${stamp}\n${extracted}` : extracted;
      }
      // Numeric vitals can't be "appended" the way text can — only set
      // them if the vet hasn't already recorded a value, so a manual entry
      // is never silently overwritten.
      for (const field of CONSULT_NUMERIC_FIELDS) {
        const value = fields[field];
        if (value === null || value === undefined) continue;
        if (visit?.[field] !== null && visit?.[field] !== undefined) continue;
        update[field] = value;
      }

      if (Object.keys(update).length > 0) {
        await supabase.from('visits').update(update).eq('id', recording.entity_id);
        if (update.weight_kg !== undefined && visit?.patient_id) {
          await supabase.from('patients').update({ current_weight_kg: update.weight_kg }).eq('id', visit.patient_id);
        }
      }

      if (fields.diagnostics_ordered?.length) {
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
        for (const t of fields.treatments_given) {
          const match = matchCatalogItem(t.name, productsAndServices || []);
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
