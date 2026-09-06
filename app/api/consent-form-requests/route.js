// app/api/consent-form-requests/route.js
// POST /api/consent-form-requests -> staff-only: create a pending remote-
// signature request for one form_type, attached to a visit or
// hospitalization exactly like an in-person one (see /api/consent-forms).
// Behind the staff PIN gate like everywhere else — the public-facing half
// of this feature is GET/POST /api/consent-form-requests/[id].

import { supabase } from '@/lib/supabaseClient';
import { CONSENT_FORM_TYPES, CONSENT_FORM_ATTACHMENT } from '@/lib/consentTemplates';
import { NextResponse } from 'next/server';

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

  const { data, error } = await supabase
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
