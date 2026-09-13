-- 094_add_core_vaccine_catalog_items.sql
-- Adds the three vaccine products the new vaccine auto-invoicing feature
-- bills against (see app/_components/useVaccinations.js): the dog and
-- cat core combination vaccines, and the shared rabies vaccine. None of
-- these existed in the catalog before — the medslist import (migration
-- 037) only brought in 'Biocan Novel', 'Biocan M Plus', and
-- 'Biofel M Plus ^', none of which match. administration_method is left
-- NULL (not 'injectable') on purpose: these prices already include the
-- subcutaneous injection fee, so the normal per-injection fee (see
-- lib/invoicing.js#applyAdministrationFee) must not also be added on top.
insert into goods_services (name, main_category, subcategory_id, pricing_type, base_price, unit)
values
    ('Biocan DHPPiL', 'product', (select id from catalog_subcategories where main_category = 'product' and name = 'Medication'), 'flat', 55.0, 'dosis'),
    ('Biofel PCH', 'product', (select id from catalog_subcategories where main_category = 'product' and name = 'Medication'), 'flat', 55.0, 'dosis'),
    ('Biocan R', 'product', (select id from catalog_subcategories where main_category = 'product' and name = 'Medication'), 'flat', 45.0, 'dosis');
