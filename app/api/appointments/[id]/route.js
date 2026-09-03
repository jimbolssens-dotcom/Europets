// app/api/appointments/[id]/route.js
// PATCH /api/appointments/:id
//   { status }                                    -> status-only update
//     (check-in, cancel, etc. — unchanged behavior)
//   { room_id?, start_time?, duration_minutes?, date?, shift? }
//     -> reschedule: move to a new time/room and/or resize the duration,
//        from dragging an appointment block on the schedule. Any field
//        left out keeps its current value. Runs the same overlap + staff
//        roster checks as booking a new appointment (see
//        lib/appointmentScheduling.js and app/api/appointments/route.js),
//        excluding the appointment from its own conflict check. duration_
//        minutes is only valid on a surgery appointment — consult is a
//        fixed 15 minutes, same rule as booking one.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { SURGERY_INCREMENT_MINUTES, findAppointmentConflict, checkStaffRoster } from '@/lib/appointmentScheduling';

const VALID_STATUSES = ['booked', 'checked_in', 'in_progress', 'complete', 'cancelled'];

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { status, room_id, start_time, duration_minutes, date, shift } = body;

  const isReschedule = room_id !== undefined || start_time !== undefined || duration_minutes !== undefined;

  if (!isReschedule) {
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
    return NextResponse.json({ error: `cannot reschedule a ${current.status} appointment` }, { status: 409 });
  }

  const nextRoomId = room_id || current.room_id;

  let nextDuration = current.duration_minutes;
  if (duration_minutes !== undefined) {
    if (current.type !== 'surgery') {
      return NextResponse.json(
        { error: 'consult appointments are a fixed 15 minutes and cannot be resized' },
        { status: 400 }
      );
    }
    nextDuration = Number(duration_minutes);
    if (
      !Number.isInteger(nextDuration) ||
      nextDuration < SURGERY_INCREMENT_MINUTES ||
      nextDuration % SURGERY_INCREMENT_MINUTES !== 0
    ) {
      return NextResponse.json(
        { error: `duration_minutes must be a multiple of ${SURGERY_INCREMENT_MINUTES}` },
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
    vetId: current.vet_id,
    startTime: nextStartTime,
    endTime: nextEndTime,
    excludeId: params.id,
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

  const rosterResult = await checkStaffRoster(supabase, { vetId: current.vet_id, date, shift });
  if (rosterResult.error) {
    return NextResponse.json({ error: rosterResult.error.message }, { status: 500 });
  }
  if (rosterResult.blocked) {
    return NextResponse.json(
      {
        error: `${rosterResult.vetName} isn't on the staff roster for that ${shift} (${date}).`,
        code: 'not_on_roster',
        vet_id: current.vet_id,
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
      room_id: nextRoomId,
      start_time: nextStartTime.toISOString(),
      duration_minutes: nextDuration,
    })
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
