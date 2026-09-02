// app/api/visits/route.js
// GET  /api/visits?status=in_progress&room_id=X   -> list visits
// GET  /api/visits?appointment_id=X                -> the visit started from that appointment
// GET  /api/visits?patient_id=X                    -> a patient's consult history
// POST /api/visits                                 -> start a visit (check-in)
//
// A visit is started either from an appointment (pass appointment_id — the
// patient/client/room/vet are taken from the appointment, which is also
// marked 'checked_in') or as a walk-in (pass patient_id, room_id directly).

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const roomId = searchParams.get('room_id');
  const appointmentId = searchParams.get('appointment_id');
  const patientId = searchParams.get('patient_id');

  let query = supabase
    .from('visits')
    .select(
      '*, patients(name, species, current_weight_kg), clients(full_name, phone), rooms(name), staff(full_name)'
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

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  let { appointment_id, patient_id, client_id, room_id, attending_vet_id } = body;

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
  }

  if (!patient_id || !room_id) {
    return NextResponse.json(
      { error: 'patient_id and room_id are required (directly, or via appointment_id)' },
      { status: 400 }
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

  const { data, error } = await supabase
    .from('visits')
    .insert([
      {
        appointment_id: appointment_id || null,
        patient_id,
        client_id,
        room_id,
        attending_vet_id: attending_vet_id || null,
        status: 'in_progress',
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (appointment_id) {
    await supabase.from('appointments').update({ status: 'checked_in' }).eq('id', appointment_id);
  }

  return NextResponse.json(data, { status: 201 });
}
