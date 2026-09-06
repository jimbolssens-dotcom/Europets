// lib/consentForms.js
// Server-only: the actual "sign a consent form" logic, shared by staff
// signing one in person (app/api/consent-forms) and a client signing one
// remotely after opening a link staff sent them (app/api/consent-form-
// requests/[id]). Always resolves the patient/client through the visit or
// hospitalization itself — never trusts a client-supplied patient_id/
// client_id — and always regenerates form_text from the canonical
// template, so the signed record can't be tampered with either way.

import { supabase } from '@/lib/supabaseClient';
import { CONSENT_FORM_ATTACHMENT, buildConsentFormText } from '@/lib/consentTemplates';

export async function createSignedConsentForm({
  visitId,
  hospitalizationId,
  formType,
  signedByName,
  signedByRelationship,
  staffWitnessId,
}) {
  const attachment = CONSENT_FORM_ATTACHMENT[formType];
  if (attachment === 'visit' && !visitId) {
    return { error: `${formType} must be signed against a visit_id`, status: 400 };
  }
  if (attachment === 'hospitalization' && !hospitalizationId) {
    return { error: `${formType} must be signed against a hospitalization_id`, status: 400 };
  }

  let patientId;
  let clientId;
  let patient;
  if (attachment === 'visit') {
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('patient_id, client_id, patients(name, sex)')
      .eq('id', visitId)
      .single();
    if (visitError || !visit) {
      return { error: 'visit not found', status: 404 };
    }
    patientId = visit.patient_id;
    clientId = visit.client_id;
    patient = visit.patients;
  } else {
    const { data: admission, error: admissionError } = await supabase
      .from('hospitalizations')
      .select('patient_id, client_id, patients(name, sex)')
      .eq('id', hospitalizationId)
      .single();
    if (admissionError || !admission) {
      return { error: 'admission not found', status: 404 };
    }
    patientId = admission.patient_id;
    clientId = admission.client_id;
    patient = admission.patients;
  }

  const formText = buildConsentFormText(formType, patient || {});

  const { data, error } = await supabase
    .from('consent_forms')
    .insert([
      {
        patient_id: patientId,
        client_id: clientId,
        visit_id: attachment === 'visit' ? visitId : null,
        hospitalization_id: attachment === 'hospitalization' ? hospitalizationId : null,
        form_type: formType,
        form_text: formText,
        signed_by_name: signedByName.trim(),
        signed_by_relationship: signedByRelationship || null,
        staff_witness_id: staffWitnessId || null,
      },
    ])
    .select('*, staff(full_name)')
    .single();

  if (error) {
    return { error: error.message, status: 500 };
  }
  return { data };
}
