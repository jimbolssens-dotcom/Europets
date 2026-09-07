-- Migration 068: shared client/patient numbering
--
-- The clinic's old system pulled a new client's number from the same
-- running counter as patient numbers, so a client's very first patient
-- always carries the same number as the client itself (e.g. client #3's
-- first pet is patient #3) -- lets staff cross-reference an old paper
-- file by a single number. clients.client_number and
-- patients.patient_number were previously two independent "generated
-- always as identity" sequences with no relationship to each other;
-- this replaces both with one shared sequence, plus a trigger that makes
-- a client's first patient reuse the client's own number instead of
-- drawing a fresh one.
--
-- Second (and later) patients for the same client still draw their own
-- next number from the shared sequence, same as before -- only the
-- *first* patient is special-cased.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create sequence if not exists clinic_number_seq;

-- clients.client_number: drop identity, move to a plain default so an
-- explicit value (the historical import) can still be inserted directly
-- -- a "generated always as identity" column rejects explicit values
-- without special syntax, a plain default does not.
alter table clients alter column client_number drop identity if exists;
alter table clients alter column client_number set default nextval('clinic_number_seq');

alter table patients alter column patient_number drop identity if exists;
alter table patients alter column patient_number set default nextval('clinic_number_seq');

-- A client's first-ever patient reuses the client's own number rather
-- than drawing a new one from the shared sequence. Runs as a trigger
-- (not application code) so the rule holds no matter which code path
-- creates the patient row (the Add Patient form, intake-request
-- approval, a future feature, ...).
create or replace function set_first_patient_number()
returns trigger
language plpgsql
as $$
begin
  if new.client_id is not null and not exists (
    select 1 from patients where client_id = new.client_id
  ) then
    select client_number into new.patient_number from clients where id = new.client_id;
  end if;
  return new;
end;
$$;

drop trigger if exists patients_first_number on patients;
create trigger patients_first_number
  before insert on patients
  for each row execute function set_first_patient_number();

-- Starts the shared sequence at 1 -- if you're about to run a historical
-- import that carries its own client/patient numbers, reseed it to
-- continue past the imported data's highest number *after* that import
-- finishes (see the import instructions), not before.
select setval('clinic_number_seq', 1, false);
