-- Marks a hospitalization_notes row as an automatic vitals copy rather
-- than something staff actually typed (see lib/hospitalizationVitalsSync.js
-- — a weight/temperature reading logged on one of two linked
-- hospitalization records, e.g. an admission and a same-day procedure
-- spun off it, gets mirrored onto the other so its own Day Treatment Plan
-- tile shows the reading as done too). These rows carry no narrative
-- content of their own (notes is always the same boilerplate line), so
-- the worksheet UI can now tell them apart from a real entry and stop
-- listing them as their own card — they were showing up as a wall of
-- "Synced automatically..." lines, once per real vitals logging, on any
-- long-running linked stay.
alter table hospitalization_notes
  add column if not exists synced_note boolean not null default false;
