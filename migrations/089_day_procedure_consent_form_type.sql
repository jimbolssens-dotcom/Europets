-- Migration 089: allow 'day_procedure' as a consent form_type.
--
-- Migration 088 added kind='day_procedure' to hospitalizations and the app
-- gained a 'day_procedure' consent form type (lib/consentTemplates.js) —
-- but consent_forms and consent_form_requests both still had their
-- original check constraint (migrations 021/061) limiting form_type to
-- the first four types, so signing a day procedure's consent failed with
-- "violates check constraint ...form_type_check". This drops and
-- re-adds both constraints with 'day_procedure' included.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table consent_forms drop constraint if exists consent_forms_form_type_check;
alter table consent_forms add constraint consent_forms_form_type_check
  check (form_type in ('surgery_standard_neuter', 'surgery_complex', 'hospitalization', 'dental', 'day_procedure'));

alter table consent_form_requests drop constraint if exists consent_form_requests_form_type_check;
alter table consent_form_requests add constraint consent_form_requests_form_type_check
  check (form_type in ('surgery_standard_neuter', 'surgery_complex', 'hospitalization', 'dental', 'day_procedure'));
