-- Migration 182: link a cattery booking to its invoice
--
-- A cattery stay had no way to carry its bill: the invoice was made by
-- hand and nothing tied it back to the booking. invoice_id on the booking
-- (not cattery_booking_id on the invoice) because one invoice covers every
-- cat of the same owner staying together: the first cat at the "Boarding -
-- Cattery" rate, each further cat at "Boarding - Cattery (2nd)".
--
-- Writes go through app/api/cattery/[id]/invoice with supabaseAdmin.
-- Safe to run more than once.

alter table cattery_bookings
  add column if not exists invoice_id uuid references invoices(id) on delete set null;

create index if not exists cattery_bookings_invoice_idx on cattery_bookings (invoice_id);
