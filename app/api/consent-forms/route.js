// app/api/consent-forms/route.js
// GET  /api/consent-forms?visit_id=X | ?hospitalization_id=X | ?patient_id=X
//        -> signed consent forms, newest first
// POST /api/consent-forms  -> sign a new one. The client only supplies
//        form_type + who signed it — the exact text is always generated
//        server-side from the canonical template (lib/consentTemplates.js)
//        and snapshotted onto the record, so it can't be tampered with.

import { supabase } from '@/lib/supabaseClient';
import { CONSENT_FORM_TYPES } from '@/lib/consentTemplates';
import { createSignedConsentForm } from '@/lib/consentForms';
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

  const result = await createSignedConsentForm({
    visitId: visit_id,
    hospitalizationId: hospitalization_id,
    formType: form_type,
    signedByName: signed_by_name,
    signedByRelationship: signed_by_relationship,
    staffWitnessId: staff_witness_id,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: 201 });
}
