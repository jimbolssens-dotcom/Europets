// app/api/consent-form-requests/[id]/route.js
// GET  -> the public signing page's own read: form type, patient name, the
//          full consent text to review, and whether it's still pending.
//          Never exposes the client's phone/email or anything beyond what
//          the signing page needs.
// POST -> the client submitting their typed name as their signature.
//          Creates the real consent_forms row (see lib/consentForms) and
//          marks this request submitted — mirrors an in-person signature
//          exactly, just with no staff_witness_id.
//
// Public (no staff PIN) — see the PUBLIC_PATTERNS entry in middleware.js.

import { supabase } from '@/lib/supabaseClient';
import { CONSENT_FORM_LABELS, CONSENT_FORM_ATTACHMENT, buildConsentFormText } from '@/lib/consentTemplates';
import { createSignedConsentForm } from '@/lib/consentForms';
import { NextResponse } from 'next/server';

async function loadPatient(request) {
  const attachment = CONSENT_FORM_ATTACHMENT[request.form_type];
  if (attachment === 'visit') {
    const { data } = await supabase.from('visits').select('patients(name, sex)').eq('id', request.visit_id).single();
    return data?.patients || null;
  }
  const { data } = await supabase
    .from('hospitalizations')
    .select('patients(name, sex)')
    .eq('id', request.hospitalization_id)
    .single();
  return data?.patients || null;
}

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('consent_form_requests')
    .select('id, status, form_type, visit_id, hospitalization_id')
    .eq('id', params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const patient = await loadPatient(data);

  return NextResponse.json({
    status: data.status,
    form_type: data.form_type,
    form_label: CONSENT_FORM_LABELS[data.form_type] || data.form_type,
    patient_name: patient?.name || null,
    form_text: buildConsentFormText(data.form_type, patient || {}),
  });
}

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const signedByName = typeof body.signed_by_name === 'string' ? body.signed_by_name.trim() : '';
  const signedByRelationship = typeof body.signed_by_relationship === 'string' ? body.signed_by_relationship.trim() : '';

  if (!signedByName) {
    return NextResponse.json({ error: 'Please type your full name to sign' }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase
    .from('consent_form_requests')
    .select('id, status, form_type, visit_id, hospitalization_id')
    .eq('id', params.id)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: 'this form has already been signed' }, { status: 409 });
  }

  const result = await createSignedConsentForm({
    visitId: existing.visit_id,
    hospitalizationId: existing.hospitalization_id,
    formType: existing.form_type,
    signedByName,
    signedByRelationship,
    staffWitnessId: null,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await supabase
    .from('consent_form_requests')
    .update({ status: 'submitted', submitted_at: new Date().toISOString(), consent_form_id: result.data.id })
    .eq('id', params.id);

  return NextResponse.json({ ok: true });
}
