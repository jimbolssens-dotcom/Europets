-- A single profile-picture URL per pet, set by the owner from the client
-- app (app/client-app/pets/[id] — see lib/attachments.js's
-- uploadPatientProfilePhoto). Deliberately just one plain column, not a
-- row in `attachments` (which models a whole gallery per entity) — this is
-- always exactly one photo, and every place that shows a pet (admin
-- patient page today; reports/WhatsApp messages later) reads it straight
-- off the patients row with no extra join.
alter table patients
  add column if not exists profile_photo_url text;
