-- Migration 227: link a primary course's booster to its first visit, and
-- retire the duplicate "Biocan R".
--
-- booster_of: on a booster dose (or the rabies reminder filled in at the
-- booster), the core-vaccine row of the Primary visit it belongs to. The
-- vaccination card (app/_components/useVaccinations.js) uses it to know a
-- course has had its booster, which is free: everything was charged at the
-- first visit.
--
-- Biocan R: migration 135 (never run on the live database) renamed and
-- retired the older stock item (AED 30 plus the SC injection fee) so vaccine
-- billing always finds the vaccine-visit one (AED 45, injection included).
-- Repeated here. Safe to run more than once.

alter table vaccinations add column if not exists booster_of uuid references vaccinations(id) on delete set null;
create index if not exists idx_vaccinations_booster_of on vaccinations(booster_of);

update goods_services
set name = 'Biocan R (SC injection, legacy)', active = false
where name = 'Biocan R' and administration_method = 'sc';
