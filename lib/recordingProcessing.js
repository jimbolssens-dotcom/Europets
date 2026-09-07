// lib/recordingProcessing.js
// Shared logic for resolving a recording's AssemblyAI job into our DB: used
// both by the AssemblyAI webhook (the fast path) and by a manual "check
// status" refresh (the fallback for when that webhook never arrives, or
// never finishes in time — see the maxDuration note below). Extracted
// verbatim from the webhook route's previous inline implementation, with
// one change: the summarization and structured-field-extraction Claude
// calls (independent of each other — both only need the transcript) now
// run in parallel instead of sequentially, since running them back to
// back was pushing real consult recordings past even the 60s maxDuration
// already set on both routes that call this.
//
// This is only safe to retry because a recording still "processing" means
// nothing has been written yet — see the "mark done" comment near the
// bottom for why that write stays where it is.

import { supabase } from '@/lib/supabaseClient';
import { getTranscript } from '@/lib/assemblyai';
import {
  summarizeTranscript,
  generateClientReport,
  extractConsultFields,
  extractHospitalizationNoteFields,
} from '@/lib/anthropicClient';
import { matchCatalogItem, filterRelevantCatalogItems } from '@/lib/catalogMatch';
import { describeDentalChart } from '@/lib/dentalChartLayout';

const CONSULT_TEXT_FIELDS = ['anamnesis', 'findings', 'diagnosis', 'prognosis', 'treatment_notes'];
const CONSULT_NUMERIC_FIELDS = ['weight_kg', 'temperature_c', 'body_condition_score'];

export async function resolveRecording(recording) {
  if (!recording.assemblyai_transcript_id) {
    throw new Error('no transcription job on record');
  }

  const job = await getTranscript(recording.assemblyai_transcript_id);

  if (job.status === 'error') {
    await supabase
      .from('recordings')
      .update({ status: 'error', error_message: job.error || 'Transcription failed' })
      .eq('id', recording.id);
    return { status: 'error' };
  }
  if (job.status !== 'completed') {
    // Still queued/processing on AssemblyAI's side — nothing to do yet.
    return { status: 'processing' };
  }

  const transcript = job.text || '';
  const hasSpeech = transcript.trim().length > 0;
  const isProcedureReport = recording.entity_type === 'surgical_report' || recording.entity_type === 'dental_report';
  const isVisit = recording.entity_type === 'visit';
  const isHospitalization = recording.entity_type === 'hospitalization';

  let summary;
  // For a visit/hospitalization, extractConsultFields / extractHospitalizationNoteFields
  // is a second, independent Claude call (it only needs `transcript` + the
  // catalog, not the summary) — computed alongside summarizeTranscript via
  // Promise.all below instead of after it, so the two don't add up
  // sequentially against the 60s maxDuration on the routes that call this.
  let fields = null;
  let tests = null;
  let productsAndServices = null;
  let catalogItems = null;

  if (!hasSpeech) {
    summary = '(No speech detected in recording.)';
  } else if (isProcedureReport) {
    // One dictation produces the whole client-facing report — what was
    // done today plus home-care instructions — grounded in the clinic's
    // approved baseline (Settings) and, for dental, the patient's current
    // dental chart.
    const table = recording.entity_type === 'surgical_report' ? 'surgical_reports' : 'dental_reports';
    const baselineColumn =
      recording.entity_type === 'surgical_report' ? 'surgical_postop_baseline' : 'dental_postop_baseline';
    const procedureType = recording.entity_type === 'surgical_report' ? 'surgical' : 'dental';

    const [{ data: report }, { data: clinic }] = await Promise.all([
      supabase.from(table).select('visits(patients(name, species, dental_chart))').eq('id', recording.entity_id).single(),
      supabase.from('clinic_settings').select(baselineColumn).eq('id', true).maybeSingle(),
    ]);
    const patient = report?.visits?.patients;

    summary = await generateClientReport({
      procedureType,
      transcript,
      patientName: patient?.name,
      species: patient?.species,
      baseline: clinic?.[baselineColumn],
      dentalChartContext:
        procedureType === 'dental' && patient ? describeDentalChart(patient.species, patient.dental_chart) : null,
    });
  } else if (isVisit) {
    // Fetch the catalog first — the extraction prompt is grounded with
    // these exact names so the model echoes them verbatim instead of
    // paraphrasing (e.g. "Anaemia PCR panel" vs. the catalog's "PCR
    // Anemia panel"), which a fuzzy match after the fact would miss.
    [{ data: tests }, { data: productsAndServices }] = await Promise.all([
      supabase.from('goods_services').select('id, name').eq('main_category', 'test').eq('active', true),
      supabase.from('goods_services').select('id, name').in('main_category', ['product', 'service']).eq('active', true),
    ]);

    [summary, fields] = await Promise.all([
      summarizeTranscript(transcript, recording.entity_type),
      extractConsultFields(transcript, {
        testNames: filterRelevantCatalogItems(transcript, tests || []).map((t) => t.name),
        productServiceNames: filterRelevantCatalogItems(transcript, productsAndServices || []).map((t) => t.name),
      }),
    ]);
  } else if (isHospitalization) {
    ({ data: catalogItems } = await supabase.from('goods_services').select('id, name').eq('active', true));

    [summary, fields] = await Promise.all([
      summarizeTranscript(transcript, recording.entity_type),
      extractHospitalizationNoteFields(
        transcript,
        filterRelevantCatalogItems(transcript, catalogItems || []).map((c) => c.name)
      ),
    ]);
  } else {
    summary = await summarizeTranscript(transcript, recording.entity_type);
  }

  // The audio has done its job once we have a transcript — nothing downstream
  // reads it back, and keeping it around only eats into the Storage bucket's
  // quota. Best-effort: if the delete fails for some reason, leave file_path
  // pointing at the file rather than orphan it with no DB reference to clean
  // up later.
  let filePathAfterDelete = recording.file_path;
  if (recording.file_path) {
    const { error: removeError } = await supabase.storage.from('consult-files').remove([recording.file_path]);
    if (!removeError) filePathAfterDelete = null;
  }

  await supabase
    .from('recordings')
    .update({ status: 'done', transcript, summary, file_path: filePathAfterDelete })
    .eq('id', recording.id);

  if (isVisit && hasSpeech) {
    const { data: visit } = await supabase
      .from('visits')
      .select([...CONSULT_TEXT_FIELDS, ...CONSULT_NUMERIC_FIELDS, 'patient_id'].join(', '))
      .eq('id', recording.entity_id)
      .single();

    const update = {};
    for (const field of CONSULT_TEXT_FIELDS) {
      const extracted = fields[field]?.trim();
      if (!extracted) continue;
      const existing = visit?.[field]?.trim();
      update[field] = existing ? `${existing}\n\n${extracted}` : extracted;
    }
    // Numeric vitals can't be "appended" the way text can — only set them
    // if the vet hasn't already recorded a value, so a manual entry is
    // never silently overwritten.
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
  } else if (recording.entity_type === 'dental_report' && hasSpeech) {
    await supabase
      .from('dental_reports')
      .update({ ai_summary: summary })
      .eq('id', recording.entity_id);
  } else if (isHospitalization && hasSpeech) {
    // The worksheet entry this is for doesn't exist as a row yet (it's an
    // unsaved draft form) — store the extraction on the recording itself;
    // the page reads it back to fill in that draft's still-empty fields
    // instead of us writing to a hospitalization_notes row. `fields` and
    // `catalogItems` were already computed above, alongside `summary`.
    const matchedItems = (fields.items_given || [])
      .map((item) => {
        const match = matchCatalogItem(item.name, catalogItems || []);
        if (!match) return null;
        return {
          goods_service_id: match.id,
          name: match.name,
          instructions: item.instructions || null,
          quantity: item.quantity || 1,
        };
      })
      .filter(Boolean);

    await supabase
      .from('recordings')
      .update({
        extracted_fields: {
          appetite: fields.appetite || null,
          weight_kg: fields.weight_kg ?? null,
          temperature_c: fields.temperature_c ?? null,
          condition: fields.condition || null,
          notes: fields.notes || null,
          items: matchedItems,
        },
      })
      .eq('id', recording.id);
  }

  return { status: 'done' };
}
