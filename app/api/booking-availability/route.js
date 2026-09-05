// app/api/booking-availability/route.js
// GET /api/booking-availability?date=YYYY-MM-DD&type=consult|spay|castration&species=&weight_kg=
//   -> open slots for a client's self-service booking request on that one
//      day: every 15-minute start time, within the client booking windows
//      (see lib/appointmentBooking.js), where a roster'd doctor is flagged
//      for the matching kind (can_consult for a consult, can_surgery for
//      a spay/castration) and isn't already booked over that time.
//
// Room availability isn't checked here — a client's request doesn't pick
// a room, staff assign one when approving it (see
// app/api/intake-requests/[id]).
//
// Everything here is computed in UAE local time (UTC+4, no DST) regardless
// of the server process's own timezone — same technique as
// app/api/shift-summary, since "9am" has to mean the clinic's 9am.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { CLIENT_APPOINTMENT_TYPES, buildClientBookingWindows, clientBookingDurationMinutes } from '@/lib/appointmentBooking';

const SLOT_STEP_MINUTES = 15;

function uaeIso(date, time) {
  return `${date}T${time}:00.000+04:00`;
}

function minutesToTime(minutes) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const type = searchParams.get('type');
  const species = searchParams.get('species');
  const weightKg = searchParams.get('weight_kg');

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'a valid date (YYYY-MM-DD) is required' }, { status: 400 });
  }
  if (!CLIENT_APPOINTMENT_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of ${CLIENT_APPOINTMENT_TYPES.join(', ')}` }, { status: 400 });
  }

  const duration = clientBookingDurationMinutes(type, species, weightKg);
  if (!duration) {
    return NextResponse.json({ error: 'could not determine a standard duration for that request' }, { status: 400 });
  }

  const capabilityColumn = type === 'consult' ? 'can_consult' : 'can_surgery';
  const dayStart = new Date(uaeIso(date, '00:00'));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [{ data: roster, error: rosterError }, { data: dayAppointments, error: apptError }, { data: clinicSettings, error: settingsError }] =
    await Promise.all([
      supabase
        .from('staff_roster_entries')
        .select('staff_id, shift, staff(full_name)')
        .eq('date', date)
        .eq(capabilityColumn, true),
      supabase
        .from('appointments')
        .select('vet_id, start_time, duration_minutes')
        .neq('status', 'cancelled')
        .gte('start_time', dayStart.toISOString())
        .lt('start_time', dayEnd.toISOString()),
      supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
    ]);

  if (rosterError) {
    return NextResponse.json({ error: rosterError.message }, { status: 500 });
  }
  if (apptError) {
    return NextResponse.json({ error: apptError.message }, { status: 500 });
  }
  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  const bookingWindows = buildClientBookingWindows(clinicSettings);

  const appointmentsByVet = new Map();
  for (const appt of dayAppointments || []) {
    if (!appt.vet_id) continue;
    if (!appointmentsByVet.has(appt.vet_id)) appointmentsByVet.set(appt.vet_id, []);
    appointmentsByVet.get(appt.vet_id).push(appt);
  }

  function isVetFree(vetId, slotStart, slotEnd) {
    const existing = appointmentsByVet.get(vetId) || [];
    return !existing.some((appt) => {
      const apptStart = new Date(appt.start_time);
      const apptEnd = new Date(apptStart.getTime() + appt.duration_minutes * 60000);
      return apptStart < slotEnd && slotStart < apptEnd;
    });
  }

  const slots = [];
  for (const entry of roster || []) {
    const window = bookingWindows.find((w) => w.shift === entry.shift);
    if (!window) continue;

    for (let startMin = window.startMinutes; startMin + duration <= window.endMinutes; startMin += SLOT_STEP_MINUTES) {
      const slotStart = new Date(uaeIso(date, minutesToTime(startMin)));
      const slotEnd = new Date(slotStart.getTime() + duration * 60000);
      if (!isVetFree(entry.staff_id, slotStart, slotEnd)) continue;
      slots.push({
        vet_id: entry.staff_id,
        vet_name: entry.staff?.full_name || 'Available doctor',
        shift: entry.shift,
        start_time: slotStart.toISOString(),
        duration_minutes: duration,
      });
    }
  }

  slots.sort((a, b) => a.start_time.localeCompare(b.start_time) || a.vet_name.localeCompare(b.vet_name));

  return NextResponse.json({ duration_minutes: duration, slots });
}
