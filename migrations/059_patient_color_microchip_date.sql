-- Migration 059: patient coat color + microchip implantation date.
--
-- Sex becoming a required field on the intake forms (app/(admin)/
-- patients/page.jsx, app/portal/intake/[id]) is a UI/API-level change
-- only — not a NOT NULL constraint here, since existing patients already
-- have a null sex and there's no safe single value to backfill them to.

alter table patients add column color text;
alter table patients add column microchip_implanted_at date;
