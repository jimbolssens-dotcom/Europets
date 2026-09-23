-- Migration 141: add a "rehomed" flag to patients, alongside the existing
-- "deceased" one.
--
-- A pet can stop being with its owner without having died — given up for
-- adoption, lost, or otherwise — and owners can now flag either case
-- themselves from the client app (see app/client-app/pets/[id]/page.js).
-- A separate boolean rather than folding this into `deceased` or a single
-- status enum: every existing "is this patient still active" check in the
-- app (vaccination reminders, the WhatsApp concierge's pet list, the
-- strikethrough on the Clients/Search pages) already keys off `deceased`
-- specifically, and a plain second boolean extends the exact same pattern
-- everywhere instead of a wider refactor. The check constraint keeps the
-- two mutually exclusive — a pet can't be both.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table patients add column if not exists rehomed boolean not null default false;

alter table patients drop constraint if exists patients_not_deceased_and_rehomed;
alter table patients add constraint patients_not_deceased_and_rehomed check (not (deceased and rehomed));
