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
  generateUltrasoundReport,
  generateXrayReport,
  extractConsultFields,
  extractHospitalizationNoteFields,
  extractDayPlanTasks,
} from '@/lib/anthropicClient';
import { matchCatalogItem, filterRelevantCatalogItems } from '@/lib/catalogMatch';
import { describeDentalChart } from '@/lib/dentalChartLayout';

const CONSULT_TEXT_FIELDS = ['anamnesis', 'findings', 'diagnosis', 'prognosis', 'treatment_notes'];
const CONSULT_NUMERIC_FIELDS = ['weight_kg', 'temperature_c', 'body_condition_score'];

// A recording got stuck reprocessing identically forever even after the
// audio-delete step above was time-boxed: every ~2-minute stale-claim
// window it got re-claimed, then died again with no error ever written,
// meaning *something* downstream of the claim was hanging (not erroring)
// somewhere we couldn't pin down without production log access. Rather
// than keep chasing individual await calls one at a time — each one
// silently swallowing the whole 60s platform ceiling if it turns out to
// be the culprit — this races the entire run against a hard deadline, so
// whatever eventually hangs, it now surfaces as a real, visible error
// instead of leaving the recording claimed and silent. The existing
// try/catch in the webhook/refresh routes already writes that error to
// the DB, so no other code needs to change.
export async function resolveRecording(recording) {
  return Promise.race([
    resolveRecordingInner(recording),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Processing timed out after 50s — please try recording again')), 50000)
    ),
  ]);
}

async function resolveRecordingInner(recording) {
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

  // Claim this recording before doing any of the real (non-idempotent) work
  // below — inserting treatment items, appending extracted text onto a
  // visit. AssemblyAI redelivers its webhook if a run is slow to respond,
  // and the client polls independently on top of that; without a claim,
  // two overlapping calls could both pass the "still processing" check
  // above and then both fully process the same recording, each inserting
  // its own copy of the same treatments and appending its own copy of the
  // same notes. A conditional UPDATE is an atomic compare-and-set: only
  // one concurrent caller's WHERE clause can still match, since the first
  // to commit changes claimed_at out from under the others. Stale claims
  // (a run that crashed after claiming but before finishing) expire after
  // 2 minutes so a recording can't get wedged behind a dead claim forever.
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: claimed } = await supabase
    .from('recordings')
    .update({ claimed_at: new Date().toISOString() })
    .eq('id', recording.id)
    .eq('status', 'processing')
    .or(`claimed_at.is.null,claimed_at.lt.${staleBefore}`)
    .select()
    .maybeSingle();
  if (!claimed) {
    // Another concurrent run already has this one — nothing to do here.
    return { status: 'processing' };
  }

  const transcript = job.text || '';
  const hasSpeech = transcript.trim().length > 0;
  const isProcedureReport = recording.entity_type === 'surgical_report' || recording.entity_type === 'dental_report';
  const isUltrasoundReport = recording.entity_type === 'ultrasound_report';
  const isXrayReport = recording.entity_type === 'xray_report';
  const isVisit = recording.entity_type === 'visit';
  const isHospitalization = recording.entity_type === 'hospitalization';
  const isHospitalizationPlan = recording.entity_type === 'hospitalization_plan';

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
  } else if (isUltrasoundReport) {
    // No baseline/home-care half here (unlike surgical/dental) — a
    // diagnostic scan has no post-op care of its own, just the elaborated
    // findings and an impression.
    const { data: report } = await supabase
      .from('ultrasound_reports')
      .select('visits(patients(name, species))')
      .eq('id', recording.entity_id)
      .single();
    const patient = report?.visits?.patients;

    summary = await generateUltrasoundReport({
      transcript,
      patientName: patient?.name,
      species: patient?.species,
    });
  } else if (isXrayReport) {
    const { data: report } = await supabase
      .from('xray_reports')
      .select('visits(patients(name, species))')
      .eq('id', recording.entity_id)
      .single();
    const patient = report?.visits?.patients;

    summary = await generateXrayReport({
      transcript,
      patientName: patient?.name,
      species: patient?.species,
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
  } else if (isHospitalizationPlan) {
    ({ data: catalogItems } = await supabase.from('goods_services').select('id, name').eq('active', true));

    [summary, fields] = await Promise.all([
      summarizeTranscript(transcript, recording.entity_type),
      extractDayPlanTasks(transcript, filterRelevantCatalogItems(transcript, catalogItems || []).map((c) => c.name)),
    ]);
  } else {
    summary = await summarizeTranscript(transcript, recording.entity_type);
  }

  // The audio has done its job once we have a transcript — nothing downstream
  // reads it back, and keeping it around only eats into the Storage bucket's
  // quota. Best-effort: if the delete fails for some reason, leave file_path
  // pointing at the file rather than orphan it with no DB reference to clean
  // up later.
  //
  // Raced against a short timeout because a Storage call has no request
  // timeout of its own — a hung (not erroring) delete would otherwise burn
  // the rest of this function's platform time limit and get the whole run
  // killed with none of the work above ever written, even though the
  // transcript/summary/fields were already ready. A recording that hit this
  // was stuck reprocessing identically forever: every retry re-claimed it,
  // redid both Claude calls successfully, then hung here again.
  let filePathAfterDelete = recording.file_path;
  if (recording.file_path) {
    const deleted = await Promise.race([
      supabase.storage
        .from('consult-files')
        .remove([recording.file_path])
        .then(({ error }) => !error),
      new Promise((resolve) => setTimeout(() => resolve(false), 8000)),
    ]);
    if (deleted) filePathAfterDelete = null;
  }

  // Checked, unlike the writes below it that only touch already-existing,
  // already-correct rows: this is the write a recording depends on to ever
  // leave 'processing', so a schema mismatch or constraint violation here
  // (as happened when file_path was still `not null` — see migration 067)
  // needs to surface as a real, visible error instead of failing silently
  // while the rest of this function carries on as if it had succeeded.
  const { error: markDoneError } = await supabase
    .from('recordings')
    .update({ status: 'done', transcript, summary, file_path: filePathAfterDelete })
    .eq('id', recording.id);
  if (markDoneError) {
    throw new Error(`Failed to mark recording done: ${markDoneError.message}`);
  }

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
    // Checked, for the same reason as the "mark done" write above: this is
    // the only place the dictated summary ever lands once the recording
    // itself gets cleaned up (see AudioRecorder's delete-on-done effect) —
    // a silently swallowed error here meant the recording still flipped to
    // 'done', got deleted, and the report was left with no summary and no
    // way to recover it.
    const { error: surgicalReportError } = await supabase
      .from('surgical_reports')
      .update({ ai_summary: summary })
      .eq('id', recording.entity_id);
    if (surgicalReportError) {
      throw new Error(`Failed to save surgical report summary: ${surgicalReportError.message}`);
    }
  } else if (recording.entity_type === 'dental_report' && hasSpeech) {
    const { error: dentalReportError } = await supabase
      .from('dental_reports')
      .update({ ai_summary: summary })
      .eq('id', recording.entity_id);
    if (dentalReportError) {
      throw new Error(`Failed to save dental report summary: ${dentalReportError.message}`);
    }
  } else if (isUltrasoundReport && hasSpeech) {
    const { error: ultrasoundReportError } = await supabase
      .from('ultrasound_reports')
      .update({ ai_summary: summary })
      .eq('id', recording.entity_id);
    if (ultrasoundReportError) {
      throw new Error(`Failed to save ultrasound report summary: ${ultrasoundReportError.message}`);
    }
  } else if (isXrayReport && hasSpeech) {
    const { error: xrayReportError } = await supabase
      .from('xray_reports')
      .update({ ai_summary: summary })
      .eq('id', recording.entity_id);
    if (xrayReportError) {
      throw new Error(`Failed to save x-ray report summary: ${xrayReportError.message}`);
    }
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
  } else if (isHospitalizationPlan && hasSpeech) {
    // Unlike the hospitalization branch above, a plan task IS a real row
    // once extracted — there's no unsaved draft form to merge it into,
    // just a list — so this inserts directly into
    // hospitalization_plan_items instead of writing to
    // recordings.extracted_fields for a page to read back.
    const addedLabels = [];
    for (const task of fields || []) {
      if (!task.label) continue;
      const match = task.catalog_name ? matchCatalogItem(task.catalog_name, catalogItems || []) : null;
      const { error: insertError } = await supabase.from('hospitalization_plan_items').insert([
        {
          hospitalization_id: recording.entity_id,
          label: task.label,
          goods_service_id: match?.id || null,
          instructions: task.instructions || null,
        },
      ]);
      if (!insertError) addedLabels.push(task.label);
    }

    // No fields for a page to merge into a draft — extracted_fields here
    // only exists so AudioRecorder's onExtractedFields fires at all (it
    // only fires when extracted_fields is truthy), signaling the plan
    // list to reload.
    await supabase
      .from('recordings')
      .update({ extracted_fields: { added_labels: addedLabels } })
      .eq('id', recording.id);
  }

  return { status: 'done' };
}
