-- Records how an appointment actually got booked — 'staff' (booked
-- directly on the desktop Appointments page or the calendar import),
-- 'client_requested' (client's own request via the app/portal, approved
-- by staff), or 'whatsapp_ai' (booked instantly by the WhatsApp AI
-- concierge, with no staff review at all) — so the schedule can flag the
-- one channel that currently has zero staff touchpoint before it's live
-- (see lib/appointmentBooking.js's BOOKING_SOURCE_BADGES and the small
-- top-right badge on both the desktop schedule and the mobile
-- Appointments list).
alter table appointments
  add column if not exists booking_source text not null default 'staff';

-- Backfill: every appointment already flagged client_requested (migration
-- 050) came from the same approve-a-request flow this column now also
-- covers, so it gets the matching value instead of defaulting to 'staff'.
update appointments
  set booking_source = 'client_requested'
  where client_requested = true and booking_source = 'staff';
