// app/api/appointments/route.js
// GET  /api/appointments?date=YYYY-MM-DD&room_id=X&vet_id=X  -> list appointments for a day
// GET  /api/appointments?month=YYYY-MM&room_id=X&vet_id=X    -> list appointments for a month
// POST /api/appointments                                     -> book a new appointment
//
// Booking rules:
//   - consult appointments are fixed at 15 minutes
//   - surgery appointments run in 10-minute increments (10, 20, 30, ...)
//   - a room (and a vet) can't be double-booked for an overlapping slot
//   - booking a vet for a date+shift the staff roster (staff_roster_entries
//     — actual dated presence, see app/(admin)/staff/roster) shows other
//     staff on but not them is a hard block, no override. Only applies
//     once that specific date+shift actually has roster data — a day
//     nobody's filled in yet is skipped rather than blocking everything.
//     The client sends date/shift computed from the *local* date/time it
//     already has (see the appointments page), sidestepping any
//     server/client timezone mismatch from re-deriving them off the
//     stored UTC start_time.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import {
  CONSULT_DURATION_MINUTES,
  SURGERY_INCREMENT_MINUTES,
  findAppointmentConflict,
  checkStaffRoster,
} from '@/lib/appointmentScheduling';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const month = searchParams.get('month');
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
  } else if (month) {
    const monthStart = new Date(`${month}-01T00:00:00.000Z`);
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    query = query.gte('start_time', monthStart.toISOString()).lt('start_time', monthEnd.toISOString());
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
  const {
    patient_id,
    room_id,
    vet_id,
    type,
    start_time,
    duration_minutes,
    reason,
    date,
    shift,
  } = body;

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
  const { conflict, error: conflictError } = await findAppointmentConflict(supabase, {
    roomId: room_id,
    vetId: vet_id,
    startTime,
    endTime,
  });

  if (conflictError) {
    return NextResponse.json({ error: conflictError.message }, { status: 500 });
  }

  if (conflict) {
    return NextResponse.json(
      { error: 'that room or vet is already booked for an overlapping time' },
      { status: 409 }
    );
  }

  // Staff roster hard block: once a specific date+shift has any roster
  // entries at all (i.e. the roster's actually been filled in for that
  // day), a vet who isn't in it is clearly not working then — no override,
  // unlike the softer schedule warning below. A day with zero roster rows
  // for anyone is left alone (nothing to check yet), so this doesn't brick
  // every booking before staff start using the roster.
  const rosterResult = await checkStaffRoster(supabase, { vetId: vet_id, date, shift });
  if (rosterResult.error) {
    return NextResponse.json({ error: rosterResult.error.message }, { status: 500 });
  }
  if (rosterResult.blocked) {
    return NextResponse.json(
      {
        error: `${rosterResult.vetName} isn't on the staff roster for that ${shift} (${date}).`,
        code: 'not_on_roster',
        vet_id,
        vet_name: rosterResult.vetName,
        date,
        shift,
      },
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
