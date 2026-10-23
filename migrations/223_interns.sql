-- 223_interns.sql
-- Interns: temporary staff (role 'intern', lib/staffRoles.js). They can
-- start under a placeholder name ("Intern 1") renamed later, get a
-- WhatsApp number for the team chat like anyone else, and an access_until
-- date: from the day after it they are switched off automatically
-- (lib/staffExpiry.js, run by the daily Social sweep) and drop out of the
-- pickers and the team chat. In the team chat they're in Everyone and
-- Medical. Safe to run more than once.

alter table staff add column if not exists access_until date;

update team_groups set roles = array['vet', 'tech', 'intern'] where key = 'vets' and not ('intern' = any(roles));
