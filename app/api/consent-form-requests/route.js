// app/api/consent-form-requests/route.js
// GET  /api/consent-form-requests?client_id=X -> that client's own consent
//      form requests (pending by default) — used by the client app's
//      dashboard/consent list so a client sees a form waiting for them
//      without staff having to send them a separate link. Public, like the
//      GET/POST on /api/consent-form-requests/[id] — see the security note
//      there and in app/client-app/layout.js.
// POST /api/consent-form-requests -> staff-only: create a pending remote-
// signature request for one form_type, attached to a visit or
// hospitalization exactly like an in-person one (see /api/consent-forms).
// Behind the staff PIN gate like everywhere else — the public-facing half
// of this feature is GET/POST /api/consent-form-requests/[id].

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { CONSENT_FORM_TYPES, CONSENT_FORM_ATTACHMENT, CONSENT_FORM_LABELS } from '@/lib/consentTemplates';
import { NextResponse } from 'next/server';
import { isStaffRequest } from '@/lib/staffAuth';
import { getClientSession } from '@/lib/clientAppAuth';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');
  const status = searchParams.get('status') || 'pending';
  if (!clientId) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  }
  // Public now (see middleware.js) — a non-staff caller must be asking
  // about their own requests.
  if (!(await isStaffRequest(request))) {
    const sessionClientId = await getClientSession(request);
    if (sessionClientId !== clientId) {
      return NextResponse.json({ error: 'not authorized' }, { status: 403 });
    }
  }

  const [{ data: visits }, { data: admissions }] = await Promise.all([
    supabase.from('visits').select('id, patients(name)').eq('client_id', clientId),
    supabase.from('hospitalizations').select('id, patients(name)').eq('client_id', clientId),
  ]);

  const visitIds = (visits || []).map((v) => v.id);
  const hospitalizationIds = (admissions || []).map((h) => h.id);
  if (visitIds.length === 0 && hospitalizationIds.length === 0) {
    return NextResponse.json([]);
  }

  const patientNameByVisit = Object.fromEntries((visits || []).map((v) => [v.id, v.patients?.name || null]));
  const patientNameByHospitalization = Object.fromEntries(
    (admissions || []).map((h) => [h.id, h.patients?.name || null])
  );

  const orFilters = [];
  if (visitIds.length > 0) orFilters.push(`visit_id.in.(${visitIds.join(',')})`);
  if (hospitalizationIds.length > 0) orFilters.push(`hospitalization_id.in.(${hospitalizationIds.join(',')})`);

  let query = supabase
    .from('consent_form_requests')
    .select('id, status, form_type, visit_id, hospitalization_id, created_at')
    .or(orFilters.join(','))
    .order('created_at', { ascending: false });
  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    data.map((row) => ({
      id: row.id,
      status: row.status,
      form_type: row.form_type,
      form_label: CONSENT_FORM_LABELS[row.form_type] || row.form_type,
      patient_name: row.visit_id
        ? patientNameByVisit[row.visit_id]
        : patientNameByHospitalization[row.hospitalization_id],
      created_at: row.created_at,
    }))
  );
}

export async function POST(request) {
  const body = await request.json();
  const { visit_id, hospitalization_id, form_type, sent_to_phone } = body;

  if (!form_type || !CONSENT_FORM_TYPES.includes(form_type)) {
    return NextResponse.json(
      { error: `form_type must be one of ${CONSENT_FORM_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  const attachment = CONSENT_FORM_ATTACHMENT[form_type];
  if (attachment === 'visit' && !visit_id) {
    return NextResponse.json({ error: `${form_type} must be requested against a visit_id` }, { status: 400 });
  }
  if (attachment === 'hospitalization' && !hospitalization_id) {
    return NextResponse.json(
      { error: `${form_type} must be requested against a hospitalization_id` },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('consent_form_requests')
    .insert([
      {
        visit_id: attachment === 'visit' ? visit_id : null,
        hospitalization_id: attachment === 'hospitalization' ? hospitalization_id : null,
        form_type,
        sent_to_phone: sent_to_phone || null,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
