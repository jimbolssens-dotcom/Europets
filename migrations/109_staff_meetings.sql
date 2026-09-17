-- Migration 109: staff meetings on the Appointments schedule
--
-- Lets staff book a "Staff Meeting / Other" appointment (no patient/client
-- involved) alongside real consults/surgeries. It always lands in a
-- dedicated "Staff Room" — a real row in `rooms` (type 'staff') so it gets
-- its own column on the Appointments day view, same as any consult/surgery
-- room, without staff having to pick a room by hand every time.
--
-- No column changes needed: appointments.type already has no CHECK
-- constraint restricting it to 'consult'/'surgery', and patient_id/
-- client_id were already nullable.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

insert into rooms (name, type)
select 'Staff Room', 'staff'
where not exists (select 1 from rooms where name = 'Staff Room');
