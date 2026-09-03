-- 038_test_other_subcategory.sql
-- Adds a catch-all "Other" subcategory under Tests, for lab tests that
-- don't fit the existing X-Ray/Ultrasound/PCR/Blood Pressure/Blood Test/
-- Urine subcategories (e.g. CVRL send-out serology, in-house rapid tests,
-- biopsy, microscopy, autopsy) — used by the services price list import
-- in 039.

insert into catalog_subcategories (main_category, name)
values ('test', 'Other')
on conflict (main_category, name) do nothing;
