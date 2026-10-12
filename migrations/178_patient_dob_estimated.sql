-- Migration 178: mark a date of birth as an estimate
--
-- Most owners only know roughly how old their pet is ("about 4 years").
-- The consult header's age box (app/_components/PatientHeader.jsx) saves
-- that as an estimated date of birth, so the age keeps counting up, and
-- this flag shows it as approximate ("~4 yrs") instead of exact.
--
-- Safe to run more than once.

alter table patients
    add column if not exists date_of_birth_estimated boolean not null default false;
