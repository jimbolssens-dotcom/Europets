-- 208_grooming_bookings.sql
-- Grooming on the Appointments schedule: a booking for a patient with just
-- a time and a length, no vet or staff member assigned (grooming is
-- flexible, whoever is free does it). Like Staff Meetings (migration 109)
-- it always lands in its own room, a real row in `rooms` (type
-- 'grooming'), so it gets its own column on the day view without anyone
-- picking a room. Several grooms may overlap; the column shows them side
-- by side (app/api/appointments: no room clash check for grooming).
--
-- No column changes needed: appointments.type has no CHECK constraint and
-- vet_id is already nullable. Safe to run more than once.

insert into rooms (name, type)
select 'Grooming', 'grooming'
where not exists (select 1 from rooms where type = 'grooming');
