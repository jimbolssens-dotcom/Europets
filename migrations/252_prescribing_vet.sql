-- Migration 252: prescriptions in the clinic owner's name (Jim, 13 Nov)
--
-- Every prescription is written in one vet's name (the owner of the
-- establishment), whoever fills it in: their name, licence number,
-- signature and stamp print on it (migrations 249, 251). Changed in
-- Settings → Clinic Identity; empty lets each prescription pick the vet.
--
-- Adds a column and sets it to Dr. Jim Bolssens. Safe to run more than once.

alter table clinic_settings add column if not exists prescribing_vet_id uuid references staff(id) on delete set null;

update clinic_settings set prescribing_vet_id = 'c141e21e-3001-469d-8f13-207ef1662cce'
 where id = true and prescribing_vet_id is null;
