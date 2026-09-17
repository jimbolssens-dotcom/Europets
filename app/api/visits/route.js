// app/api/visits/route.js
// GET  /api/visits?status=in_progress&room_id=X   -> list visits
// GET  /api/visits?appointment_id=X                -> the visit started from that appointment
// GET  /api/visits?patient_id=X                    -> a patient's consult history
// GET  /api/visits?client_id=X                     -> an owner's consult history, across all their pets
// POST /api/visits                                 -> start a visit (check-in)
//
// A visit is started either from an appointment (pass appointment_id — the
// patient/client/room/vet are taken from the appointment, which is also
// marked 'checked_in') or as a walk-in (pass patient_id, room_id directly).
// Rejects with 409 (+ existingVisitId) if that patient already has an
// in_progress visit — every check-in screen redirects there instead of
// creating a second, parallel consult for the same patient.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

// The video-consult flow polls this route (both the staff consult page and
// the client's portal join page waiting on the same room) — same caching
// gotcha documented on the hospitalizations route: force-dynamic alone
// stops Next's own cache, the matching header in next.config.js is what
// stops a CDN/edge layer from serving a stale response on top of that.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const roomId = searchParams.get('room_id');
  const appointmentId = searchParams.get('appointment_id');
  const patientId = searchParams.get('patient_id');
  const clientId = searchParams.get('client_id');

  let query = supabase
    .from('visits')
    .select(
      // hospitalizations(id, status) is a reverse embed via hospitalizations.originating_visit_id
      // — lets the Consults board split out visits currently admitted to
      // hospitalization (see app/(admin)/consults/page.jsx) without a second fetch.
      '*, patients(name, species, patient_number, current_weight_kg), clients(full_name, phone, client_number), rooms(name), staff(full_name), hospitalizations(id, status, admitted_at)'
    )
    .order('started_at', { ascending: true });

  if (status) {
    query = query.eq('status', status);
  }
  if (roomId) {
    query = query.eq('room_id', roomId);
  }
  if (appointmentId) {
    query = query.eq('appointment_id', appointmentId);
  }
  if (patientId) {
    query = query.eq('patient_id', patientId);
  }
  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  let { appointment_id, patient_id, client_id, room_id, attending_vet_id, is_video } = body;
  is_video = Boolean(is_video);

  if (appointment_id) {
    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointment_id)
      .single();

    if (apptError || !appointment) {
      return NextResponse.json({ error: 'appointment not found' }, { status: 400 });
    }

    patient_id = patient_id || appointment.patient_id;
    client_id = client_id || appointment.client_id;
    room_id = room_id || appointment.room_id;
    attending_vet_id = attending_vet_id || appointment.vet_id;
    // A 'video' appointment (see app/api/appointments/route.js) never had a
    // room to begin with — check-in from it is a video consult automatically,
    // without whatever screen calls this (the Appointments page's own
    // Checkin button, unchanged) needing to know or pass that itself.
    is_video = is_video || appointment.type === 'video';
  }

  // A video consult has no physical room — it's the one case room_id is
  // allowed to stay empty (see migration 115).
  if (!patient_id || (!room_id && !is_video)) {
    return NextResponse.json(
      { error: 'patient_id and room_id are required (directly, or via appointment_id), unless is_video is set' },
      { status: 400 }
    );
  }

  // A patient can only ever have one open consult at a time — whichever
  // screen this came from (a walk-in, an appointment check-in, a mobile
  // check-in) should land staff on that existing consult instead of
  // starting a second one alongside it.
  const { data: existingVisit } = await supabase
    .from('visits')
    .select('id')
    .eq('patient_id', patient_id)
    .eq('status', 'in_progress')
    .limit(1)
    .maybeSingle();

  if (existingVisit) {
    return NextResponse.json(
      { error: 'This patient already has an open consult', existingVisitId: existingVisit.id },
      { status: 409 }
    );
  }

  if (!client_id) {
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('client_id')
      .eq('id', patient_id)
      .single();

    if (patientError || !patient) {
      return NextResponse.json({ error: 'patient not found' }, { status: 400 });
    }
    client_id = patient.client_id;
  }

  const { data, error } = await supabaseAdmin
    .from('visits')
    .insert([
      {
        appointment_id: appointment_id || null,
        patient_id,
        client_id,
        room_id: room_id || null,
        attending_vet_id: attending_vet_id || null,
        status: 'in_progress',
        is_video,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (appointment_id) {
    await supabaseAdmin.from('appointments').update({ status: 'checked_in' }).eq('id', appointment_id);
  }

  return NextResponse.json(data, { status: 201 });
}
