// app/api/consent-forms/route.js
// GET  /api/consent-forms?visit_id=X | ?hospitalization_id=X | ?patient_id=X
//        -> signed consent forms, newest first
// POST /api/consent-forms  -> sign a new one. The client only supplies
//        form_type + who signed it — the exact text is always generated
//        server-side from the canonical template (lib/consentTemplates.js)
//        and snapshotted onto the record, so it can't be tampered with.

import { supabase } from '@/lib/supabaseClient';
import { CONSENT_FORM_TYPES, CONSENT_FORM_ATTACHMENT, buildConsentFormText } from '@/lib/consentTemplates';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visit_id');
  const hospitalizationId = searchParams.get('hospitalization_id');
  const patientId = searchParams.get('patient_id');

  if (!visitId && !hospitalizationId && !patientId) {
    return NextResponse.json(
      { error: 'visit_id, hospitalization_id, or patient_id is required' },
      { status: 400 }
    );
  }

  let query = supabase
    .from('consent_forms')
    .select('*, staff(full_name)')
    .order('signed_at', { ascending: false });

  if (visitId) query = query.eq('visit_id', visitId);
  else if (hospitalizationId) query = query.eq('hospitalization_id', hospitalizationId);
  else query = query.eq('patient_id', patientId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { visit_id, hospitalization_id, form_type, signed_by_name, signed_by_relationship, staff_witness_id } = body;

  if (!form_type || !CONSENT_FORM_TYPES.includes(form_type)) {
    return NextResponse.json(
      { error: `form_type must be one of ${CONSENT_FORM_TYPES.join(', ')}` },
      { status: 400 }
    );
  }
  if (!signed_by_name || !signed_by_name.trim()) {
    return NextResponse.json({ error: 'signed_by_name is required' }, { status: 400 });
  }

  const attachment = CONSENT_FORM_ATTACHMENT[form_type];
  if (attachment === 'visit' && !visit_id) {
    return NextResponse.json({ error: `${form_type} must be signed against a visit_id` }, { status: 400 });
  }
  if (attachment === 'hospitalization' && !hospitalization_id) {
    return NextResponse.json(
      { error: `${form_type} must be signed against a hospitalization_id` },
      { status: 400 }
    );
  }

  // Look up the patient (and its owner) through whichever record this form
  // attaches to — never trust a client-supplied patient_id/client_id,
  // since the signed text and liability record has to reflect who's
  // actually on file.
  let patientId;
  let clientId;
  let patient;
  if (attachment === 'visit') {
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('patient_id, client_id, patients(name, sex)')
      .eq('id', visit_id)
      .single();
    if (visitError || !visit) {
      return NextResponse.json({ error: 'visit not found' }, { status: 404 });
    }
    patientId = visit.patient_id;
    clientId = visit.client_id;
    patient = visit.patients;
  } else {
    const { data: admission, error: admissionError } = await supabase
      .from('hospitalizations')
      .select('patient_id, client_id, patients(name, sex)')
      .eq('id', hospitalization_id)
      .single();
    if (admissionError || !admission) {
      return NextResponse.json({ error: 'admission not found' }, { status: 404 });
    }
    patientId = admission.patient_id;
    clientId = admission.client_id;
    patient = admission.patients;
  }

  const form_text = buildConsentFormText(form_type, patient || {});

  const { data, error } = await supabase
    .from('consent_forms')
    .insert([
      {
        patient_id: patientId,
        client_id: clientId,
        visit_id: attachment === 'visit' ? visit_id : null,
        hospitalization_id: attachment === 'hospitalization' ? hospitalization_id : null,
        form_type,
        form_text,
        signed_by_name: signed_by_name.trim(),
        signed_by_relationship: signed_by_relationship || null,
        staff_witness_id: staff_witness_id || null,
      },
    ])
    .select('*, staff(full_name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
