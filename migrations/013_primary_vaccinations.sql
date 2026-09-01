-- Primary vaccination courses: a "Mark as Primary" button on a vaccination
-- schedules its species' core vaccine for a 1-month booster instead of the
-- normal annual interval, and — only if rabies wasn't given in that same
-- visit — adds a rabies reminder for that same 1-month date (rabies isn't
-- a 2-dose primary series, so if it WAS given it just stays on its normal
-- annual cycle).

-- is_rabies lets the app find "the rabies protocol for this species"
-- without string-matching on the display name (which has already been
-- renamed once).
alter table vaccine_protocols add column is_rabies boolean not null default false;
update vaccine_protocols set is_rabies = true where name = 'Rabies';

alter table vaccinations add column is_primary boolean not null default false;

-- A rabies reminder scheduled because rabies WASN'T given at the primary
-- visit has no actual dose yet — date_given becomes optional so that
-- "scheduled, not yet given" can be represented as its own row.
alter table vaccinations alter column date_given drop not null;
