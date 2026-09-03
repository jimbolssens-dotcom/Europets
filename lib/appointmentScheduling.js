// lib/appointmentScheduling.js
// Shared validation for anything that places an appointment on the
// schedule — booking a new one (POST /api/appointments) and moving/
// resizing an existing one by dragging it (PATCH /api/appointments/:id).
// Both need the exact same two checks (room/vet overlap, staff roster),
// so they're factored out here rather than duplicated.

export const CONSULT_DURATION_MINUTES = 15;
export const SURGERY_INCREMENT_MINUTES = 10;
export const SHIFTS = ['morning', 'afternoon'];

// A room (and a vet, if one's assigned) can't be double-booked for an
// overlapping slot. excludeId leaves the appointment being moved/resized
// out of its own conflict check — otherwise it would always "conflict"
// with itself.
export async function findAppointmentConflict(supabase, { roomId, vetId, startTime, endTime, excludeId }) {
  const conflictWindStart = new Date(startTime.getTime() - 12 * 60 * 60000).toISOString();
  const conflictWindEnd = endTime.toISOString();

  let query = supabase
    .from('appointments')
    .select('id, room_id, vet_id, start_time, duration_minutes, status')
    .neq('status', 'cancelled')
    .gte('start_time', conflictWindStart)
    .lt('start_time', conflictWindEnd)
    .or(`room_id.eq.${roomId}${vetId ? `,vet_id.eq.${vetId}` : ''}`);

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
    return appt.room_id === roomId || (vetId && appt.vet_id === vetId);
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
