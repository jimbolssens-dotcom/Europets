// lib/appointmentScheduling.js
// Shared validation for anything that places an appointment on the
// schedule — booking a new one (POST /api/appointments) and moving/
// resizing an existing one by dragging it (PATCH /api/appointments/:id).
// Both need the exact same two checks (room/vet overlap, staff roster),
// so they're factored out here rather than duplicated.

export const CONSULT_DURATION_MINUTES = 15;
export const SURGERY_INCREMENT_MINUTES = 10;
export const MEETING_DEFAULT_DURATION_MINUTES = 30;
export const MEETING_MIN_DURATION_MINUTES = 5;
export const SHIFTS = ['morning', 'afternoon'];

// A room (and a vet, if one's assigned) can't be double-booked for an
// overlapping slot. excludeId leaves the appointment being moved/resized
// out of its own conflict check — otherwise it would always "conflict"
// with itself.
//
// roomId is falsy for a video consult (see migration-free 'video' type in
// app/api/appointments/route.js — no physical room at all), so the room
// half of the check is skipped entirely rather than passed through: a
// literal `room_id.eq.` (or `.eq.null`) filter would either match nothing
// useful or, worse, fail outright since room_id is a uuid column and
// "null" isn't valid uuid syntax. A video consult still can't double-book
// the same vet, which the vetId half alone still covers.
export async function findAppointmentConflict(supabase, { roomId, vetId, startTime, endTime, excludeId }) {
  if (!roomId && !vetId) return { conflict: null };

  const conflictWindStart = new Date(startTime.getTime() - 12 * 60 * 60000).toISOString();
  const conflictWindEnd = endTime.toISOString();

  const orClauses = [];
  if (roomId) orClauses.push(`room_id.eq.${roomId}`);
  if (vetId) orClauses.push(`vet_id.eq.${vetId}`);

  let query = supabase
    .from('appointments')
    .select('id, room_id, vet_id, start_time, duration_minutes, status')
    .neq('status', 'cancelled')
    .gte('start_time', conflictWindStart)
    .lt('start_time', conflictWindEnd)
    .or(orClauses.join(','));

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data: existing, error } = await query;
  if (error) return { error };

  const conflict = (existing || []).find((appt) => {
    const apptStart = new Date(appt.start_time);
    const apptEnd = new Date(apptStart.getTime() + appt.duration_minutes * 60000);
    const overlaps = apptStart < endTime && startTime < apptEnd;
    if (!overlaps) return false;
    return (roomId && appt.room_id === roomId) || (vetId && appt.vet_id === vetId);
  });

  return { conflict: conflict || null };
}

// Staff roster hard block: once a specific date+shift has any roster
// entries at all, a vet who isn't in it is clearly not working then — no
// override. A day with zero roster rows for anyone is left alone.
export async function checkStaffRoster(supabase, { vetId, date, shift }) {
  if (!vetId || !date || !SHIFTS.includes(shift)) {
    return { blocked: false };
  }

  const { data: dayRoster, error } = await supabase
    .from('staff_roster_entries')
    .select('staff_id')
    .eq('date', date)
    .eq('shift', shift);

  if (error) return { error };

  if (dayRoster.length > 0 && !dayRoster.some((r) => r.staff_id === vetId)) {
    const { data: vet } = await supabase.from('staff').select('full_name').eq('id', vetId).single();
    return { blocked: true, vetName: vet?.full_name || 'This vet' };
  }

  return { blocked: false };
}
