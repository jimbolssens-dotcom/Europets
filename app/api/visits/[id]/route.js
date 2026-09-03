// app/api/visits/[id]/route.js
// GET    /api/visits/:id  -> a single consult, with patient/client/room/vet joins
// PATCH  /api/visits/:id  -> update status and/or the medical record fields.
// Completing a consult sets ended_at and also completes its linked
// appointment. Updating weight_kg also syncs the patient's current weight.
// DELETE /api/visits/:id  -> remove a consult (blocked if it has a linked
// invoice or hospitalization admission). Diagnostics/treatment items/
// surgical & dental reports/consult notes cascade automatically; their
// file attachments and audio recordings don't (they're linked generically
// via entity_type/entity_id), so those are cleaned up explicitly here.

import { supabase } from '@/lib/supabaseClient';
import { lockExtractedTeeth } from '@/lib/dentalChartLayout';
import { NextResponse } from 'next/server';

const VALID_STATUSES = ['in_progress', 'complete'];
const RECORD_FIELDS = [
  'weight_kg',
  'temperature_c',
  'body_condition_score',
  'anamnesis',
  'findings',
  'diagnosis',
  'prognosis',
  'treatment_notes',
];

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('visits')
    .select(
      '*, patients(id, name, species, breed, sex, current_weight_kg, dental_chart), clients(id, full_name, phone, email), rooms(name), staff(full_name)'
    )
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { status } = body;

  const update = {};
  for (const field of RECORD_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field] === '' ? null : body[field];
  }

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }
    update.status = status;
    if (status === 'complete') {
      update.ended_at = new Date().toISOString();
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('visits')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (update.weight_kg !== undefined && update.weight_kg !== null) {
    await supabase
      .from('patients')
      .update({ current_weight_kg: update.weight_kg })
      .eq('id', data.patient_id);
  }

  if (status === 'complete' && data.appointment_id) {
    await supabase
      .from('appointments')
      .update({ status: 'complete' })
      .eq('id', data.appointment_id);
  }

  // Completing a consult "locks in" this visit's dental work — any tooth
  // just marked extracted (documented as such on the report already sent)
  // becomes a plain missing tooth for every future visit, same as one
  // that was already gone. Only touches patients with an actual dental
  // report on this visit, and only if there's something to convert.
  if (status === 'complete') {
    const { data: dentalReports } = await supabase
      .from('dental_reports')
      .select('id')
      .eq('visit_id', params.id)
      .limit(1);
    if (dentalReports?.length) {
      const { data: patient } = await supabase
        .from('patients')
        .select('dental_chart')
        .eq('id', data.patient_id)
        .single();
      const locked = lockExtractedTeeth(patient?.dental_chart);
      if (locked && JSON.stringify(locked) !== JSON.stringify(patient.dental_chart)) {
        await supabase.from('patients').update({ dental_chart: locked }).eq('id', data.patient_id);
      }
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const visitId = params.id;

  const [{ data: diagnostics }, { data: surgicalReports }, { data: dentalReports }] =
    await Promise.all([
      supabase.from('diagnostics').select('id').eq('visit_id', visitId),
      supabase.from('surgical_reports').select('id').eq('visit_id', visitId),
      supabase.from('dental_reports').select('id').eq('visit_id', visitId),
    ]);

  const relevantIds = [
    visitId,
    ...(diagnostics || []).map((d) => d.id),
    ...(surgicalReports || []).map((r) => r.id),
    ...(dentalReports || []).map((r) => r.id),
  ];

  const [{ data: attachments }, { data: recordings }] = await Promise.all([
    supabase.from('attachments').select('id, file_path').in('entity_id', relevantIds),
    supabase.from('recordings').select('id, file_path').in('entity_id', relevantIds),
  ]);

  const filePaths = [
    ...(attachments || []).map((a) => a.file_path),
    ...(recordings || []).map((r) => r.file_path),
  ];
  if (filePaths.length > 0) {
    await supabase.storage.from('consult-files').remove(filePaths);
  }
  if (attachments?.length) {
    await supabase.from('attachments').delete().in('id', attachments.map((a) => a.id));
  }
  if (recordings?.length) {
    await supabase.from('recordings').delete().in('id', recordings.map((r) => r.id));
  }

  const { error } = await supabase.from('visits').delete().eq('id', visitId);

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        {
          error:
            'cannot delete this consult — it has a linked invoice or hospitalization admission. Void the invoice / resolve the admission first.',
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
