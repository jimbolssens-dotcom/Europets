-- Migration 138: pin set_first_patient_number's search_path
--
-- A function with no explicit search_path resolves its unqualified table
-- references (patients, clients) using whatever search_path is active at
-- call time — normally harmless, but it means a schema created earlier in
-- some future search_path than `public` could shadow those names and
-- silently redirect this trigger's reads/writes to the wrong table.
-- Pinning search_path removes that ambiguity entirely. No behavior
-- change: this function has only ever meant the public schema's own
-- patients/clients tables.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create or replace function set_first_patient_number()
returns trigger
language plpgsql
set search_path = public
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
