-- Migration 031: administration methods for medications — dispensed (as
-- tablets/liquid to take home), given subcutaneously (SC), or given
-- intramuscularly (IM) — each carrying its own clinic-wide fee that gets
-- added automatically as a second invoice line item when a treatment
-- item is invoiced with that method chosen. See lib/invoicing.js.
-- Run this in your Supabase SQL editor. Safe to run more than once.

-- Which methods a given catalog item (medication) supports.
alter table goods_services add column if not exists allow_dispense boolean not null default false;
alter table goods_services add column if not exists allow_sc boolean not null default false;
alter table goods_services add column if not exists allow_im boolean not null default false;

-- Which method was actually used for this specific prescription.
alter table treatment_items add column if not exists administration_method text
    check (administration_method in ('dispense', 'sc', 'im'));

-- The three clinic-wide fee amounts (AED, pre-VAT), editable in Settings.
alter table clinic_settings add column if not exists dispensing_fee numeric(10,2) not null default 0;
alter table clinic_settings add column if not exists sc_injection_fee numeric(10,2) not null default 0;
alter table clinic_settings add column if not exists im_injection_fee numeric(10,2) not null default 0;
