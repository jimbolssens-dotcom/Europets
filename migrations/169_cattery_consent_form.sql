-- Migration 169: a cattery-specific consent form
--
-- Adds the 'cattery' consent form type (lib/consentTemplates.js), which is
-- attached to a cattery booking (migration 167) instead of a visit or a
-- hospitalization. It's sent automatically over WhatsApp the moment a
-- booking is created (POST /api/cattery), through the same approved
-- consent_form_ready template and signing page as every other consent
-- form, and its signed copy is kept on consent_forms like the others.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table consent_form_requests
    add column if not exists cattery_booking_id uuid references cattery_bookings(id) on delete cascade;
alter table consent_forms
    add column if not exists cattery_booking_id uuid references cattery_bookings(id) on delete set null;

create index if not exists idx_consent_form_requests_cattery_booking on consent_form_requests(cattery_booking_id);
create index if not exists idx_consent_forms_cattery_booking on consent_forms(cattery_booking_id);

alter table consent_forms drop constraint if exists consent_forms_form_type_check;
alter table consent_forms add constraint consent_forms_form_type_check
  check (form_type in ('surgery_standard_neuter', 'surgery_complex', 'hospitalization', 'dental', 'day_procedure', 'cattery'));

alter table consent_form_requests drop constraint if exists consent_form_requests_form_type_check;
alter table consent_form_requests add constraint consent_form_requests_form_type_check
  check (form_type in ('surgery_standard_neuter', 'surgery_complex', 'hospitalization', 'dental', 'day_procedure', 'cattery'));
