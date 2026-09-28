// app/api/review-requests/route.js
// GET  /api/review-requests  -> list every review/testimonial request,
//                                newest first, for the staff Reviews page
// POST /api/review-requests  -> { patient_id, sent_to_phone? } generate a
//                                fresh link to send a client over WhatsApp,
//                                asking them to leave a review on the
//                                public website (see app/(admin)/patients/
//                                [id]'s "Request a Review" — this used to
//                                live on the client page, but a review is
//                                really about one visit/pet, not the whole
//                                account, so the link — and the review
//                                itself once submitted — is scoped to the
//                                patient. client_id is derived from the
//                                patient's own owner rather than taken as
//                                a separate input, so the two can never
//                                disagree.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function GET() {
  const { data, error } = await supabase
    .from('review_requests')
    .select('*, clients(id, full_name), patients(id, name)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));

  if (!body.patient_id) {
    return NextResponse.json({ error: 'patient_id is required' }, { status: 400 });
  }

  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('id, client_id')
    .eq('id', body.patient_id)
    .single();
  if (patientError || !patient) {
    return NextResponse.json({ error: 'patient not found' }, { status: 404 });
  }
  if (!patient.client_id) {
    return NextResponse.json({ error: 'this patient has no owner on file' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('review_requests')
    .insert([{ patient_id: patient.id, client_id: patient.client_id, sent_to_phone: body.sent_to_phone || null }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
