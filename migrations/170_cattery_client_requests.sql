-- Migration 170: clients can request cattery stays from the client app
--
-- A client picks the cat, dates and a free space in the client app
-- (app/client-app/cattery/new). That creates a cattery_bookings row with
-- status 'requested', which holds the space while staff review it on the
-- Cattery planner. Nothing is confirmed until staff approve it (status
-- becomes 'booked' and the cattery consent form goes out on WhatsApp) or
-- decline it ('declined', with a reason the client sees). A request nobody
-- answers within 48 hours becomes 'expired' and frees the space (see
-- lib/catteryServer.js expireStaleRequests).
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table cattery_bookings drop constraint if exists cattery_bookings_status_check;
alter table cattery_bookings add constraint cattery_bookings_status_check
  check (status in ('requested', 'booked', 'checked_in', 'checked_out', 'cancelled', 'declined', 'expired'));

alter table cattery_bookings add column if not exists requested_by_client boolean not null default false;
alter table cattery_bookings add column if not exists owner_notes text;
alter table cattery_bookings add column if not exists request_expires_at timestamptz;
alter table cattery_bookings add column if not exists decline_reason text;
alter table cattery_bookings add column if not exists approved_at timestamptz;

create index if not exists cattery_bookings_requested_idx on cattery_bookings (status, request_expires_at);
