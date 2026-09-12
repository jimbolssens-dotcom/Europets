// app/api/appointments/[id]/route.js
// PATCH /api/appointments/:id
//   { status }                                    -> status-only update
//     (check-in, cancel, etc. — unchanged behavior)
//   { mark_reminded: true } | { clear_reminder: true }
//     -> record/clear when a WhatsApp reminder was last sent (see
//        reminder_sent_at, migration 079) — same pattern as vaccination
//        reminders (app/api/vaccinations/[id]).
//   { room_id?, start_time?, duration_minutes?, vet_id?, type?, patient_id?, reason?, date?, shift? }
//     -> edit: reschedule (drag-to-move/resize on the schedule) and/or
//        change patient, vet, type, or reason (the Edit Appointment modal).
//        Any field left out keeps its current value. Runs the same overlap
//        + staff roster checks as booking a new appointment (see
//        lib/appointmentScheduling.js and app/api/appointments/route.js),
//        excluding the appointment from its own conflict check.
//        duration_minutes is only meaningful for a surgery appointment —
//        consult is a fixed 15 minutes, same rule as booking one; switching
//        type to surgery without a duration defaults to one increment.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import {
  CONSULT_DURATION_MINUTES,
  SURGERY_INCREMENT_MINUTES,
  findAppointmentConflict,
  checkStaffRoster,
} from '@/lib/appointmentScheduling';

const VALID_STATUSES = ['booked', 'checked_in', 'in_progress', 'complete', 'cancelled', 'no_show'];

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { status, room_id, start_time, duration_minutes, vet_id, type, patient_id, reason, date, shift } = body;

  if (body.mark_reminded || body.clear_reminder) {
    const { data, error } = await supabase
      .from('appointments')
      .update({ reminder_sent_at: body.mark_reminded ? new Date().toISOString() : null })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  const isEdit =
    room_id !== undefined ||
    start_time !== undefined ||
    duration_minutes !== undefined ||
    vet_id !== undefined ||
    type !== undefined ||
    patient_id !== undefined ||
    reason !== undefined;

  if (!isEdit) {
    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }
    const { data, error } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  const { data: current, error: currentError } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', params.id)
    .single();

  if (currentError || !current) {
    return NextResponse.json({ error: 'appointment not found' }, { status: 404 });
  }
  if (current.status === 'cancelled' || current.status === 'complete') {
    return NextResponse.json({ error: `cannot edit a ${current.status} appointment` }, { status: 409 });
  }

  const nextRoomId = room_id || current.room_id;
  const nextVetId = vet_id !== undefined ? vet_id || null : current.vet_id;
  const nextType = type === 'surgery' || type === 'consult' ? type : current.type;
  const nextReason = reason !== undefined ? reason || null : current.reason;

  let nextPatientId = current.patient_id;
  let nextClientId = current.client_id;
  if (patient_id !== undefined && patient_id !== current.patient_id) {
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('client_id')
      .eq('id', patient_id)
      .single();
    if (patientError || !patient) {
      return NextResponse.json({ error: 'patient not found' }, { status: 400 });
    }
    nextPatientId = patient_id;
    nextClientId = patient.client_id;
  }

  let nextDuration = current.duration_minutes;
  if (nextType === 'consult') {
    nextDuration = CONSULT_DURATION_MINUTES;
  } else {
    if (duration_minutes !== undefined) {
      nextDuration = Number(duration_minutes);
    } else if (current.type !== 'surgery') {
      nextDuration = SURGERY_INCREMENT_MINUTES;
    }
    if (
      !Number.isInteger(nextDuration) ||
      nextDuration < SURGERY_INCREMENT_MINUTES ||
      nextDuration % SURGERY_INCREMENT_MINUTES !== 0
    ) {
      return NextResponse.json(
        { error: `surgery duration_minutes must be a multiple of ${SURGERY_INCREMENT_MINUTES}` },
        { status: 400 }
      );
    }
  }

  const nextStartTime = start_time ? new Date(start_time) : new Date(current.start_time);
  if (Number.isNaN(nextStartTime.getTime())) {
    return NextResponse.json({ error: 'start_time must be a valid date/time' }, { status: 400 });
  }
  const nextEndTime = new Date(nextStartTime.getTime() + nextDuration * 60000);

  const { conflict, error: conflictError } = await findAppointmentConflict(supabase, {
    roomId: nextRoomId,
    vetId: nextVetId,
    startTime: nextStartTime,
    endTime: nextEndTime,
    excludeId: params.id,
  });
  if (conflictError) {
    return NextResponse.json({ error: conflictError.message }, { status: 500 });
  }
  if (conflict) {
    // A room clash can be resolved on the spot by picking a different,
    // free room — surface enough to retry the same move/edit with just
    // room_id swapped (see the room-conflict popup on the Appointments
    // page). A vet clash has no such one-click fix, so it just falls back
    // to a plain error.
    if (conflict.room_id === nextRoomId) {
      return NextResponse.json(
        {
          error: 'That room is already booked for an overlapping time.',
          code: 'room_conflict',
          retry: {
            room_id: nextRoomId,
            vet_id: nextVetId,
            type: nextType,
            patient_id: nextPatientId,
            reason: nextReason,
            start_time: nextStartTime.toISOString(),
            duration_minutes: nextDuration,
            date,
            shift,
          },
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'that room or vet is already booked for an overlapping time' },
      { status: 409 }
    );
  }

  const rosterResult = await checkStaffRoster(supabase, { vetId: nextVetId, date, shift });
  if (rosterResult.error) {
    return NextResponse.json({ error: rosterResult.error.message }, { status: 500 });
  }
  if (rosterResult.blocked) {
    return NextResponse.json(
      {
        error: `${rosterResult.vetName} isn't on the staff roster for that ${shift} (${date}).`,
        code: 'not_on_roster',
        vet_id: nextVetId,
        vet_name: rosterResult.vetName,
        date,
        shift,
      },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from('appointments')
    .update({
      patient_id: nextPatientId,
      client_id: nextClientId,
      room_id: nextRoomId,
      vet_id: nextVetId,
      type: nextType,
      start_time: nextStartTime.toISOString(),
      duration_minutes: nextDuration,
      reason: nextReason,
    })
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
