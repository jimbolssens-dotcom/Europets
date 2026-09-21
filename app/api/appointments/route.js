// app/api/appointments/route.js
// GET  /api/appointments?date=YYYY-MM-DD&room_id=X&vet_id=X  -> list appointments for a day
// GET  /api/appointments?month=YYYY-MM&room_id=X&vet_id=X    -> list appointments for a month
// GET  /api/appointments?client_id=X                         -> one client's appointments, any date
//                                                                (the client app's own Appointments tab)
// POST /api/appointments                                     -> book a new appointment
//
// Booking rules:
//   - consult appointments are fixed at 15 minutes
//   - video consult appointments are also fixed at 15 minutes, and have no
//     room at all — see migration 115's visits.is_video for the actual
//     call, created at check-in (see POST /api/visits deriving is_video
//     from this appointment's type)
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
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import {
  CONSULT_DURATION_MINUTES,
  SURGERY_INCREMENT_MINUTES,
  MEETING_DEFAULT_DURATION_MINUTES,
  MEETING_MIN_DURATION_MINUTES,
  findAppointmentConflict,
  checkStaffRoster,
} from '@/lib/appointmentScheduling';
import { isStaffRequest } from '@/lib/staffAuth';
import { getClientSession } from '@/lib/clientAppAuth';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const month = searchParams.get('month');
  const roomId = searchParams.get('room_id');
  const vetId = searchParams.get('vet_id');
  const clientId = searchParams.get('client_id');

  // Reachable without the staff PIN now (the client app's own Appointments
  // tab — see middleware.js) — a non-staff caller must be asking for
  // exactly their own appointments, never the date/month schedule views
  // this same route also serves for staff.
  if (!(await isStaffRequest(request))) {
    const sessionClientId = await getClientSession(request);
    if (!clientId || sessionClientId !== clientId) {
      return NextResponse.json({ error: 'not authorized' }, { status: 403 });
    }
  }

  let query = supabase
    .from('appointments')
    .select(
      '*, patients(name, species), clients(full_name, phone, client_number), rooms(name), staff(full_name)'
    )
    .order('start_time', { ascending: true });

  if (clientId) query = query.eq('client_id', clientId);
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

  if (!start_time) {
    return NextResponse.json({ error: 'start_time is required' }, { status: 400 });
  }

  const appointmentType =
    type === 'surgery' ? 'surgery' : type === 'meeting' ? 'meeting' : type === 'video' ? 'video' : 'consult';

  // A video consult has no physical room — everything else still needs one.
  if (appointmentType !== 'video' && !room_id) {
    return NextResponse.json({ error: 'room_id is required' }, { status: 400 });
  }

  // A staff meeting has no patient/client — everything else still needs one.
  if (appointmentType !== 'meeting' && !patient_id) {
    return NextResponse.json({ error: 'patient_id is required' }, { status: 400 });
  }

  let duration;
  if (appointmentType === 'consult' || appointmentType === 'video') {
    duration = CONSULT_DURATION_MINUTES;
  } else if (appointmentType === 'surgery') {
    duration = Number(duration_minutes) || SURGERY_INCREMENT_MINUTES;
    if (duration < SURGERY_INCREMENT_MINUTES || duration % SURGERY_INCREMENT_MINUTES !== 0) {
      return NextResponse.json(
        { error: `surgery duration_minutes must be a multiple of ${SURGERY_INCREMENT_MINUTES}` },
        { status: 400 }
      );
    }
  } else {
    duration = Number(duration_minutes) || MEETING_DEFAULT_DURATION_MINUTES;
    if (!Number.isInteger(duration) || duration < MEETING_MIN_DURATION_MINUTES) {
      return NextResponse.json(
        { error: `duration_minutes must be at least ${MEETING_MIN_DURATION_MINUTES} minutes` },
        { status: 400 }
      );
    }
  }

  const startTime = new Date(start_time);
  if (Number.isNaN(startTime.getTime())) {
    return NextResponse.json({ error: 'start_time must be a valid date/time' }, { status: 400 });
  }
  const endTime = new Date(startTime.getTime() + duration * 60000);

  // look up the owning client from the patient record — skipped for a
  // patient-less staff meeting
  let clientId = null;
  if (patient_id) {
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('client_id')
      .eq('id', patient_id)
      .single();

    if (patientError || !patient) {
      return NextResponse.json({ error: 'patient not found' }, { status: 400 });
    }
    clientId = patient.client_id;
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

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .insert([
      {
        patient_id: patient_id || null,
        client_id: clientId,
        room_id: room_id || null,
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
