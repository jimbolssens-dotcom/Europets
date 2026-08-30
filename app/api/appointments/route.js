// app/api/appointments/route.js
// GET  /api/appointments?date=YYYY-MM-DD&room_id=X&vet_id=X  -> list appointments
// POST /api/appointments                                     -> book a new appointment
//
// Booking rules:
//   - consult appointments are fixed at 15 minutes
//   - surgery appointments run in 10-minute increments (10, 20, 30, ...)
//   - a room (and a vet) can't be double-booked for an overlapping slot

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const CONSULT_DURATION_MINUTES = 15;
const SURGERY_INCREMENT_MINUTES = 10;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const roomId = searchParams.get('room_id');
  const vetId = searchParams.get('vet_id');

  let query = supabase
    .from('appointments')
    .select(
      '*, patients(name, species), clients(full_name, phone), rooms(name), staff(full_name)'
    )
    .order('start_time', { ascending: true });

  if (date) {
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T00:00:00.000Z`);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    query = query.gte('start_time', dayStart.toISOString()).lt('start_time', dayEnd.toISOString());
  }
  if (roomId) {
    query = query.eq('room_id', roomId);
  }
  if (vetId) {
    query = query.eq('vet_id', vetId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { patient_id, room_id, vet_id, type, start_time, duration_minutes, reason } = body;

  if (!patient_id || !room_id || !start_time) {
    return NextResponse.json(
      { error: 'patient_id, room_id, and start_time are required' },
      { status: 400 }
    );
  }

  const appointmentType = type === 'surgery' ? 'surgery' : 'consult';
  let duration;
  if (appointmentType === 'consult') {
    duration = CONSULT_DURATION_MINUTES;
  } else {
    duration = Number(duration_minutes) || SURGERY_INCREMENT_MINUTES;
    if (duration < SURGERY_INCREMENT_MINUTES || duration % SURGERY_INCREMENT_MINUTES !== 0) {
      return NextResponse.json(
        { error: `surgery duration_minutes must be a multiple of ${SURGERY_INCREMENT_MINUTES}` },
        { status: 400 }
      );
    }
  }

  const startTime = new Date(start_time);
  if (Number.isNaN(startTime.getTime())) {
    return NextResponse.json({ error: 'start_time must be a valid date/time' }, { status: 400 });
  }
  const endTime = new Date(startTime.getTime() + duration * 60000);

  // look up the owning client from the patient record
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('client_id')
    .eq('id', patient_id)
    .single();

  if (patientError || !patient) {
    return NextResponse.json({ error: 'patient not found' }, { status: 400 });
  }

  // conflict check: room and vet can't overlap with an existing booked slot
  const conflictWindStart = new Date(startTime.getTime() - 12 * 60 * 60000).toISOString();
  const conflictWindEnd = endTime.toISOString();

  const { data: existing, error: existingError } = await supabase
    .from('appointments')
    .select('id, room_id, vet_id, start_time, duration_minutes, status')
    .neq('status', 'cancelled')
    .gte('start_time', conflictWindStart)
    .lt('start_time', conflictWindEnd)
    .or(`room_id.eq.${room_id}${vet_id ? `,vet_id.eq.${vet_id}` : ''}`);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const conflict = (existing || []).find((appt) => {
    const apptStart = new Date(appt.start_time);
    const apptEnd = new Date(apptStart.getTime() + appt.duration_minutes * 60000);
    const overlaps = apptStart < endTime && startTime < apptEnd;
    if (!overlaps) return false;
    return appt.room_id === room_id || (vet_id && appt.vet_id === vet_id);
  });

  if (conflict) {
    return NextResponse.json(
      { error: 'that room or vet is already booked for an overlapping time' },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert([
      {
        patient_id,
        client_id: patient.client_id,
        room_id,
        vet_id: vet_id || null,
        type: appointmentType,
        start_time: startTime.toISOString(),
        duration_minutes: duration,
        reason: reason || null,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
