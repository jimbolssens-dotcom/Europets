-- Migration 198: a small pet / exotic handling consent form
--
-- Adds the 'small_pet' consent form type (lib/consentTemplates.js): signed
-- on a consult, before a rabbit, hamster, bird or other small pet or
-- exotic is handled at all, because stress from handling alone can kill
-- them. Every other consent form for a small pet also opens with the same
-- handling risk section; that's text only and needs no schema change.
--
-- Safe to run more than once.

alter table consent_forms drop constraint if exists consent_forms_form_type_check;
alter table consent_forms add constraint consent_forms_form_type_check
  check (form_type in ('surgery_standard_neuter', 'surgery_complex', 'hospitalization', 'dental', 'day_procedure', 'cattery', 'small_pet'));

alter table consent_form_requests drop constraint if exists consent_form_requests_form_type_check;
alter table consent_form_requests add constraint consent_form_requests_form_type_check
  check (form_type in ('surgery_standard_neuter', 'surgery_complex', 'hospitalization', 'dental', 'day_procedure', 'cattery', 'small_pet'));
