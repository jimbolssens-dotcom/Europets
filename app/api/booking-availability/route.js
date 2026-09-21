// app/api/booking-availability/route.js
// GET /api/booking-availability?date=YYYY-MM-DD&type=consult|video|spay|castration&species=&weight_kg=
//   -> open slots for a client's self-service booking request on that one
//      day: every 15-minute start time, within the client booking windows
//      (see lib/appointmentBooking.js), where a roster'd doctor is flagged
//      for the matching kind (can_consult for a consult or video consult,
//      can_surgery for anything else) and isn't already booked over that
//      time. Anything but a consult/video consult is restricted to the
//      morning window regardless of what shift that flag is set on —
//      surgeries (including dental) aren't done in the afternoon, per
//      clinic policy.
//
// Room availability isn't checked here — a client's request doesn't pick
// a room, staff assign one when approving it (see
// app/api/intake-requests/[id]).
//
// The actual slot computation lives in lib/appointmentBooking.js's
// computeAvailableSlots — shared with the WhatsApp AI concierge
// (lib/whatsappConcierge.js), which walks the exact same roster/conflict
// logic to check and book a consult, rather than re-implementing it.
//
// Everything here is computed in UAE local time (UTC+4, no DST) regardless
// of the server process's own timezone — same technique as
// app/api/shift-summary, since "9am" has to mean the clinic's 9am.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { computeAvailableSlots } from '@/lib/appointmentBooking';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const type = searchParams.get('type');
  const species = searchParams.get('species');
  const weightKg = searchParams.get('weight_kg');

  const result = await computeAvailableSlots(supabase, { date, type, species, weightKg });
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  }
  return NextResponse.json({ duration_minutes: result.duration_minutes, slots: result.slots });
}
