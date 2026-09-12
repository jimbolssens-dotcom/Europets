// lib/consentForms.js
// Server-only: the actual "sign a consent form" logic, shared by staff
// signing one in person (app/api/consent-forms) and a client signing one
// remotely after opening a link staff sent them (app/api/consent-form-
// requests/[id]). Always resolves the patient/client/treatment plan
// through the visit or hospitalization itself — never trusts a client-
// supplied patient_id/client_id/treatment plan — and always regenerates
// form_text from the canonical template, so the signed record can't be
// tampered with either way.

import { supabase } from '@/lib/supabaseClient';
import { CONSENT_FORM_ATTACHMENT, buildConsentFormText } from '@/lib/consentTemplates';

async function fetchTreatmentPlan(visitId) {
  const { data } = await supabase
    .from('treatment_items')
    .select('instructions, goods_services(name)')
    .eq('visit_id', visitId)
    .order('created_at', { ascending: true });
  return data || [];
}

// A day procedure's checklist (see migration 076/088) — the same
// dictate-and-cross-reference-the-catalog list shown as tap-to-log
// buttons on the hospitalization page. Included for any hospitalization
// consent form, not just day_procedure, since a multi-day admission can
// carry one too.
async function fetchPlanItems(hospitalizationId) {
  const { data } = await supabase
    .from('hospitalization_plan_items')
    .select('label, instructions, is_surgical, goods_services(name)')
    .eq('hospitalization_id', hospitalizationId)
    .order('created_at', { ascending: true });
  return data || [];
}

// Resolves the patient/client and the treatment plan a consent form's text
// is built from — for a surgery/dental form, straight from its own
// visit_id; for a hospitalization form, from the admission's own
// originating_visit_id (its prior consult), if it has one — a direct
// admission with no prior consult just gets no treatment plan section.
// Shared by createSignedConsentForm below and the remote-signing page's
// own preview (see app/api/consent-form-requests/[id]).
export async function resolveConsentFormContext({ visitId, hospitalizationId, formType }) {
  const attachment = CONSENT_FORM_ATTACHMENT[formType];

  if (attachment === 'visit') {
    if (!visitId) return { error: `${formType} must be attached to a visit_id`, status: 400 };
    const { data: visit, error } = await supabase
      .from('visits')
      .select('patient_id, client_id, treatment_notes, patients(name, sex)')
      .eq('id', visitId)
      .single();
    if (error || !visit) return { error: 'visit not found', status: 404 };

    return {
      patientId: visit.patient_id,
      clientId: visit.client_id,
      patient: visit.patients,
      treatmentNotes: visit.treatment_notes,
      treatmentItems: await fetchTreatmentPlan(visitId),
    };
  }

  if (!hospitalizationId) return { error: `${formType} must be attached to a hospitalization_id`, status: 400 };
  const { data: admission, error } = await supabase
    .from('hospitalizations')
    .select('patient_id, client_id, originating_visit_id, patients(name, sex)')
    .eq('id', hospitalizationId)
    .single();
  if (error || !admission) return { error: 'admission not found', status: 404 };

  let treatmentNotes = null;
  let treatmentItems = [];
  if (admission.originating_visit_id) {
    const { data: originVisit } = await supabase
      .from('visits')
      .select('treatment_notes')
      .eq('id', admission.originating_visit_id)
      .single();
    treatmentNotes = originVisit?.treatment_notes || null;
    treatmentItems = await fetchTreatmentPlan(admission.originating_visit_id);
  }
  treatmentItems = [...treatmentItems, ...(await fetchPlanItems(hospitalizationId))];

  return {
    patientId: admission.patient_id,
    clientId: admission.client_id,
    patient: admission.patients,
    treatmentNotes,
    treatmentItems,
  };
}

export async function createSignedConsentForm({
  visitId,
  hospitalizationId,
  formType,
  signedByName,
  signedByRelationship,
  staffWitnessId,
}) {
  const context = await resolveConsentFormContext({ visitId, hospitalizationId, formType });
  if (context.error) return context;

  const formText = buildConsentFormText(formType, context.patient || {}, {
    treatmentNotes: context.treatmentNotes,
    treatmentItems: context.treatmentItems,
  });

  const { data, error } = await supabase
    .from('consent_forms')
    .insert([
      {
        patient_id: context.patientId,
        client_id: context.clientId,
        visit_id: CONSENT_FORM_ATTACHMENT[formType] === 'visit' ? visitId : null,
        hospitalization_id: CONSENT_FORM_ATTACHMENT[formType] === 'hospitalization' ? hospitalizationId : null,
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
