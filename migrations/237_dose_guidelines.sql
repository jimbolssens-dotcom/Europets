-- Migration 237: guideline doses for medicines (Dose guidelines page)
--
-- Jim: staff sometimes give the wrong dose, so each medicine gets a
-- guideline dose that the app fills in from the pet's weight, staff can
-- change, and that warns outside the range (lib/doseGuidelines.js). The
-- amount filled in is what's given and what's billed.
--
-- One row per catalog item and species ('cat', 'dog' or 'any'), with a
-- variant where the dose depends on something else (GS for FIP: wet, dry,
-- eye, neuro). How the amount is worked out:
--
--   mg_per_kg      dose_per_kg (mg, or IU for strength_unit 'IU') x weight,
--                  divided by strength (mg per ml / tablet / vial), rounded
--                  to round_to (0.01 ml, a quarter tablet, a whole vial);
--                  min_per_kg..max_per_kg is the range.
--   per_kg_amount  amount_per_kg x weight, e.g. 0.1 ml per kg.
--   per_animal     fixed_amount whatever the weight; weight_min_kg /
--                  weight_max_kg say which pets a product is for (Bravecto).
--   bands          bands [{max_kg, amount}], then band_step_amount more per
--                  band_step_kg above the last band (the dewormer).
--   note           guidance text only, nothing filled in.
--
-- Only approved rows (approved_at set) are used. Seeded with the list Dr
-- Jim approved on 31 Oct 2026. Server-only (RLS on, no policy): read and
-- written through /api/dose-guidelines. Safe to run more than once.

create table if not exists dose_guidelines (
  id uuid primary key default gen_random_uuid(),
  goods_service_id uuid not null references goods_services(id) on delete cascade,
  species text not null default 'any' check (species in ('cat', 'dog', 'any')),
  variant text,
  rule text not null check (rule in ('mg_per_kg', 'per_kg_amount', 'per_animal', 'bands', 'note')),
  strength numeric,
  strength_unit text not null default 'mg',
  dose_unit text not null default 'ml',
  dose_per_kg numeric,
  min_per_kg numeric,
  max_per_kg numeric,
  fixed_amount numeric,
  amount_per_kg numeric,
  bands jsonb,
  band_step_kg numeric,
  band_step_amount numeric,
  weight_min_kg numeric,
  weight_max_kg numeric,
  round_to numeric,
  frequency text,
  notes text,
  source text,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists dose_guidelines_item_species_variant
  on dose_guidelines (goods_service_id, species, coalesce(variant, ''));

alter table dose_guidelines enable row level security;

-- The approved list (31 Oct 2026), matched to the catalog by name.
insert into dose_guidelines (goods_service_id, species, variant, rule, strength, strength_unit, dose_unit, dose_per_kg, min_per_kg, max_per_kg, fixed_amount, amount_per_kg, bands, band_step_kg, band_step_amount, weight_min_kg, weight_max_kg, round_to, frequency, notes, source, approved_at, approved_by)
select g.id, v.species, v.variant, v.rule, v.strength, coalesce(v.strength_unit, 'mg'), v.dose_unit, v.dose_per_kg, v.min_per_kg, v.max_per_kg, v.fixed_amount, v.amount_per_kg, v.bands, v.band_step_kg, v.band_step_amount, v.weight_min_kg, v.weight_max_kg, v.round_to, v.frequency, v.notes, v.source, '2026-10-31T12:00:00+04:00', 'Dr Jim Bolssens'
from (values
('Melvet (Meloxicam) 5mg/ml (per 1ml) ^', 'cat', null, 'mg_per_kg', 5, 'mg', 'ml', 0.2, 0.1, 0.3, null, null, null, null, null, null, null, 0.01, 'once (cats: single dose, do not repeat)', null, 'Product leaflet (EU/UK VMD/FDA)'),
('Animeloxan inj 5mg/ml', 'cat', null, 'mg_per_kg', 5, 'mg', 'ml', 0.2, 0.1, 0.3, null, null, null, null, null, null, null, 0.01, 'once (cats: single dose, do not repeat)', null, 'Product leaflet (EU/UK VMD/FDA)'),
('Melosolute 5mg/ml (per ml) Animeloxan', 'cat', null, 'mg_per_kg', 5, 'mg', 'ml', 0.2, 0.1, 0.3, null, null, null, null, null, null, null, 0.01, 'once (cats: single dose, do not repeat)', null, 'Product leaflet (EU/UK VMD/FDA)'),
('Melvet (Meloxicam) 5mg/ml (per 1ml) ^', 'dog', null, 'mg_per_kg', 5, 'mg', 'ml', 0.2, 0.1, 0.2, null, null, null, null, null, null, null, 0.01, 'once, then oral', null, 'Product leaflet (EU/UK VMD/FDA)'),
('Animeloxan inj 5mg/ml', 'dog', null, 'mg_per_kg', 5, 'mg', 'ml', 0.2, 0.1, 0.2, null, null, null, null, null, null, null, 0.01, 'once, then oral', null, 'Product leaflet (EU/UK VMD/FDA)'),
('Melosolute 5mg/ml (per ml) Animeloxan', 'dog', null, 'mg_per_kg', 5, 'mg', 'ml', 0.2, 0.1, 0.2, null, null, null, null, null, null, null, 0.01, 'once, then oral', null, 'Product leaflet (EU/UK VMD/FDA)'),
('Megasil la Inj (per ml) ^', 'any', null, 'mg_per_kg', 150, 'mg', 'ml', 15, 12, 18, null, null, null, null, null, null, null, 0.01, 'every 48 h', null, 'Dr Jim (amoxicillin LA 150 mg/ml)'),
('Convenia 80mg/ml - (Per ml)', 'any', null, 'mg_per_kg', 80, 'mg', 'ml', 8, 7, 9, null, null, null, null, null, null, null, 0.01, 'once, may repeat at 14 days', null, 'Product leaflet (EU/UK VMD/FDA)'),
('Cerenia inj (per ml) ^', 'any', null, 'mg_per_kg', 10, 'mg', 'ml', 1, 0.8, 1.2, null, null, null, null, null, null, null, 0.01, 'daily, up to 5 days', null, 'Product leaflet (EU/UK VMD/FDA)'),
('Vetacortyl (per ml) ^', 'cat', null, 'mg_per_kg', 40, 'mg', 'ml', 2, 2, 4, null, null, null, null, null, null, null, 0.01, 'single; at least 1 week apart', null, 'Product leaflet (EU/UK VMD/FDA)'),
('Vetacortyl (per ml) ^', 'dog', null, 'mg_per_kg', 40, 'mg', 'ml', 1, 0.5, 2, null, null, null, null, null, null, null, 0.01, 'single; at least 1 week apart', null, 'Product leaflet (EU/UK VMD/FDA)'),
('Marbocyl 2%inj', 'any', null, 'mg_per_kg', 20, 'mg', 'ml', 2, 2, 2.5, null, null, null, null, null, null, null, 0.01, 'daily', null, 'Dr Jim'),
('Enroplus 10ml', 'dog', null, 'mg_per_kg', 50, 'mg', 'ml', 5, 5, 10, null, null, null, null, null, null, null, 0.01, 'daily', null, 'Dr Jim (50 mg/ml)'),
('Enroplus 10ml', 'cat', null, 'mg_per_kg', 50, 'mg', 'ml', 5, 2.5, 5, null, null, null, null, null, null, null, 0.01, 'daily', 'Cats max 5 mg/kg (retina)', 'Dr Jim (50 mg/ml)'),
('Cortamethazone (Dexa) per ml', 'any', null, 'mg_per_kg', 2, 'mg', 'ml', 0.1, 0.05, 0.2, null, null, null, null, null, null, null, 0.01, 'daily', null, 'Dr Jim (2 mg/ml)'),
('Dexamethasone 2mg (Colvasone)', 'any', null, 'mg_per_kg', 2, 'mg', 'ml', 0.1, 0.05, 0.2, null, null, null, null, null, null, null, 0.01, 'daily', null, 'Dr Jim (2 mg/ml)'),
('Gastrine inj (per ml) ^', 'any', null, 'mg_per_kg', 5, 'mg', 'ml', 0.3, 0.2, 0.5, null, null, null, null, null, null, null, 0.01, 'every 8 to 12 h', null, 'Standard label dose (metoclopramide 5 mg/ml)'),
('Furosemide inj (per ml)', 'any', null, 'mg_per_kg', 50, 'mg', 'ml', 2, 1, 4, null, null, null, null, null, null, null, 0.01, 'every 6 to 12 h', 'Up to 4 mg/kg in heart failure emergencies', 'Standard label dose'),
('Frusemide inj', 'any', null, 'mg_per_kg', 50, 'mg', 'ml', 2, 1, 4, null, null, null, null, null, null, null, 0.01, 'every 6 to 12 h', 'Up to 4 mg/kg in heart failure emergencies', 'Standard label dose'),
('Atropin', 'any', null, 'mg_per_kg', 0.6, 'mg', 'ml', 0.03, 0.02, 0.04, null, null, null, null, null, null, null, 0.01, 'as needed', null, 'Standard label dose (0.6 mg/ml)'),
('Epotin 4000 inj (per ampol) ^', 'any', null, 'mg_per_kg', 4000, 'IU', 'ampoule', 100, 50, 100, null, null, null, null, null, null, null, 0.01, '3 times a week', null, 'Standard label dose'),
('Alfafer 10% inj (per ml) ^', 'dog', null, 'mg_per_kg', 100, 'mg', 'ml', 10, 10, 20, null, null, null, null, null, null, null, 0.01, 'once', null, 'Standard label dose'),
('Alfafer 10% inj (per ml) ^', 'cat', null, 'per_animal', null, null, 'ml', null, null, null, 0.5, null, null, null, null, null, null, null, 'once', '50 mg per cat', null),
('Ornipural inj (per ml) ^', 'any', null, 'per_kg_amount', null, null, 'ml', null, null, null, null, 0.2, null, null, null, null, null, 0.1, 'daily, 3 to 5 days', '1 ml per 5 kg', null),
('Troy B Complex Injectable 100ml', 'cat', null, 'per_animal', null, null, 'ml', null, null, null, 0.5, null, null, null, null, null, null, null, 'as needed', '0.5 ml per cat', null),
('Troy B Complex Injectable 100ml', 'dog', null, 'per_kg_amount', null, null, 'ml', null, null, null, null, 0.1, null, null, null, null, null, 0.1, 'as needed', '1 ml per 10 kg', null),
('GS 15 mg/ml (per ml)', 'cat', 'wet FIP', 'mg_per_kg', 15, 'mg', 'ml', 6, 6, 8, null, null, null, null, null, null, null, 0.01, 'daily SC, 84 days', null, 'Dr Jim'),
('GS 15 mg/ml (per ml)', 'cat', 'dry FIP', 'mg_per_kg', 15, 'mg', 'ml', 8, 8, 10, null, null, null, null, null, null, null, 0.01, 'daily SC, 84 days', null, 'Dr Jim'),
('GS 15 mg/ml (per ml)', 'cat', 'eye FIP', 'mg_per_kg', 15, 'mg', 'ml', 10, 10, 10, null, null, null, null, null, null, null, 0.01, 'daily SC, 84 days', null, 'Dr Jim'),
('GS 15 mg/ml (per ml)', 'cat', 'neuro FIP', 'mg_per_kg', 15, 'mg', 'ml', 10, 10, 12, null, null, null, null, null, null, null, 0.01, 'daily SC, 84 days', null, 'Dr Jim'),
('GS 20 mg/ml (per ml)', 'cat', 'wet FIP', 'mg_per_kg', 20, 'mg', 'ml', 6, 6, 8, null, null, null, null, null, null, null, 0.01, 'daily SC, 84 days', null, 'Dr Jim'),
('GS 20 mg/ml (per ml)', 'cat', 'dry FIP', 'mg_per_kg', 20, 'mg', 'ml', 8, 8, 10, null, null, null, null, null, null, null, 0.01, 'daily SC, 84 days', null, 'Dr Jim'),
('GS 20 mg/ml (per ml)', 'cat', 'eye FIP', 'mg_per_kg', 20, 'mg', 'ml', 10, 10, 10, null, null, null, null, null, null, null, 0.01, 'daily SC, 84 days', null, 'Dr Jim'),
('GS 20 mg/ml (per ml)', 'cat', 'neuro FIP', 'mg_per_kg', 20, 'mg', 'ml', 10, 10, 12, null, null, null, null, null, null, null, 0.01, 'daily SC, 84 days', null, 'Dr Jim'),
('GS 30 mg/ml (per ml)', 'cat', 'wet FIP', 'mg_per_kg', 30, 'mg', 'ml', 6, 6, 8, null, null, null, null, null, null, null, 0.01, 'daily SC, 84 days', null, 'Dr Jim'),
('GS 30 mg/ml (per ml)', 'cat', 'dry FIP', 'mg_per_kg', 30, 'mg', 'ml', 8, 8, 10, null, null, null, null, null, null, null, 0.01, 'daily SC, 84 days', null, 'Dr Jim'),
('GS 30 mg/ml (per ml)', 'cat', 'eye FIP', 'mg_per_kg', 30, 'mg', 'ml', 10, 10, 10, null, null, null, null, null, null, null, 0.01, 'daily SC, 84 days', null, 'Dr Jim'),
('GS 30 mg/ml (per ml)', 'cat', 'neuro FIP', 'mg_per_kg', 30, 'mg', 'ml', 10, 10, 12, null, null, null, null, null, null, null, 0.01, 'daily SC, 84 days', null, 'Dr Jim'),
('Librela 5mg', 'dog', null, 'mg_per_kg', 5, 'mg', 'vial', 0.5, 0.5, 1, null, null, null, null, null, null, null, 1, 'monthly', null, 'Standard label dose'),
('Librela 10mg', 'dog', null, 'mg_per_kg', 10, 'mg', 'vial', 0.5, 0.5, 1, null, null, null, null, null, null, null, 1, 'monthly', null, 'Standard label dose'),
('Librela 15mg', 'dog', null, 'mg_per_kg', 15, 'mg', 'vial', 0.5, 0.5, 1, null, null, null, null, null, null, null, 1, 'monthly', null, 'Standard label dose'),
('Librela 20mg', 'dog', null, 'mg_per_kg', 20, 'mg', 'vial', 0.5, 0.5, 1, null, null, null, null, null, null, null, 1, 'monthly', null, 'Standard label dose'),
('Solensia', 'cat', null, 'bands', null, null, 'ml', null, null, null, null, null, '[{"max_kg": 7, "amount": 1}, {"max_kg": 14, "amount": 2}]'::jsonb, null, null, null, null, null, 'monthly', '1 ml for 2.5 to 7 kg, 2 ml for 7.1 to 14 kg', null),
('Cytopoint 10mg', 'dog', null, 'mg_per_kg', 10, 'mg', 'vial', 2, 1, 2, null, null, null, null, null, null, null, 1, 'monthly', null, 'Standard label dose'),
('Cytopoint 20mg', 'dog', null, 'mg_per_kg', 20, 'mg', 'vial', 2, 1, 2, null, null, null, null, null, null, null, 1, 'monthly', null, 'Standard label dose'),
('Cytopoint 30mg', 'dog', null, 'mg_per_kg', 30, 'mg', 'vial', 2, 1, 2, null, null, null, null, null, null, null, 1, 'monthly', null, 'Standard label dose'),
('Doxycare 40mg (Doxycycline)', 'any', null, 'mg_per_kg', 40, 'mg', 'tablet', 10, 5, 10, null, null, null, null, null, null, null, 0.25, 'daily (or 5 mg/kg twice)', 'Cats: follow with water', 'Standard label dose'),
('Doxycare Tablets 200mg', 'any', null, 'mg_per_kg', 200, 'mg', 'tablet', 10, 5, 10, null, null, null, null, null, null, null, 0.25, 'daily (or 5 mg/kg twice)', 'Cats: follow with water', 'Standard label dose'),
('Doxivit 100mg zvet (per tab)', 'any', null, 'mg_per_kg', 100, 'mg', 'tablet', 10, 5, 10, null, null, null, null, null, null, null, 0.25, 'daily (or 5 mg/kg twice)', 'Cats: follow with water', 'Standard label dose'),
('Doxivit 200mg zvet (per tab) ^', 'any', null, 'mg_per_kg', 200, 'mg', 'tablet', 10, 5, 10, null, null, null, null, null, null, null, 0.25, 'daily (or 5 mg/kg twice)', 'Cats: follow with water', 'Standard label dose'),
('Doxycicline 100mg', 'any', null, 'mg_per_kg', 100, 'mg', 'tablet', 10, 5, 10, null, null, null, null, null, null, null, 0.25, 'daily (or 5 mg/kg twice)', 'Cats: follow with water', 'Standard label dose'),
('Doxycycline 100mg (Vibramycin)', 'any', null, 'mg_per_kg', 100, 'mg', 'tablet', 10, 5, 10, null, null, null, null, null, null, null, 0.25, 'daily (or 5 mg/kg twice)', 'Cats: follow with water', 'Standard label dose'),
('Clavaseptin 50mg (per tab) ^', 'any', null, 'mg_per_kg', 50, 'mg', 'tablet', 12.5, 12.5, 25, null, null, null, null, null, null, null, 0.25, 'twice daily', 'Combined amoxicillin + clavulanate mg', 'Standard label dose'),
('CLAVASEPTIN 250MG ', 'any', null, 'mg_per_kg', 250, 'mg', 'tablet', 12.5, 12.5, 25, null, null, null, null, null, null, null, 0.25, 'twice daily', 'Combined amoxicillin + clavulanate mg', 'Standard label dose'),
('Clavasept 50', 'any', null, 'mg_per_kg', 50, 'mg', 'tablet', 12.5, 12.5, 25, null, null, null, null, null, null, null, 0.25, 'twice daily', 'Combined amoxicillin + clavulanate mg', 'Standard label dose'),
('Kesium 50 mg/12.5 mg Chewable Tablets _x0000_', 'any', null, 'mg_per_kg', 62.5, 'mg', 'tablet', 12.5, 12.5, 25, null, null, null, null, null, null, null, 0.25, 'twice daily', 'Combined amoxicillin + clavulanate mg', 'Standard label dose'),
('Kesium 200 mg/50 mg Chewable Tablets for Dogs, 240 Tabs', 'any', null, 'mg_per_kg', 250, 'mg', 'tablet', 12.5, 12.5, 25, null, null, null, null, null, null, null, 0.25, 'twice daily', 'Combined amoxicillin + clavulanate mg', 'Standard label dose'),
('Kesium 500 mg/ 125mg Chewable Tablets _x0000_', 'any', null, 'mg_per_kg', 625, 'mg', 'tablet', 12.5, 12.5, 25, null, null, null, null, null, null, null, 0.25, 'twice daily', 'Combined amoxicillin + clavulanate mg', 'Standard label dose'),
('Juroclav 50 (per tab) ^', 'any', null, 'mg_per_kg', 50, 'mg', 'tablet', 12.5, 12.5, 25, null, null, null, null, null, null, null, 0.25, 'twice daily', 'Combined amoxicillin + clavulanate mg', 'Standard label dose'),
('Juroclav 250mg (per tab) ^', 'any', null, 'mg_per_kg', 250, 'mg', 'tablet', 12.5, 12.5, 25, null, null, null, null, null, null, null, 0.25, 'twice daily', 'Combined amoxicillin + clavulanate mg', 'Standard label dose'),
('Juroclav 500mg (per tab)', 'any', null, 'mg_per_kg', 500, 'mg', 'tablet', 12.5, 12.5, 25, null, null, null, null, null, null, null, 0.25, 'twice daily', 'Combined amoxicillin + clavulanate mg', 'Standard label dose'),
('Amoxiclav  40/10 mg', 'any', null, 'mg_per_kg', 50, 'mg', 'tablet', 12.5, 12.5, 25, null, null, null, null, null, null, null, 0.25, 'twice daily', 'Combined amoxicillin + clavulanate mg', 'Standard label dose'),
('cladaxxa 40mg/10mg chewable tablet for cats and dogs', 'any', null, 'mg_per_kg', 50, 'mg', 'tablet', 12.5, 12.5, 25, null, null, null, null, null, null, null, 0.25, 'twice daily', 'Combined amoxicillin + clavulanate mg', 'Standard label dose'),
('cladaxxa 200mg/50mg chewable tablets for cats and dogs', 'any', null, 'mg_per_kg', 250, 'mg', 'tablet', 12.5, 12.5, 25, null, null, null, null, null, null, null, 0.25, 'twice daily', 'Combined amoxicillin + clavulanate mg', 'Standard label dose'),
('Cladaxxa 400mg/100mg chewable tablet for dogs', 'any', null, 'mg_per_kg', 500, 'mg', 'tablet', 12.5, 12.5, 25, null, null, null, null, null, null, null, 0.25, 'twice daily', 'Combined amoxicillin + clavulanate mg', 'Standard label dose'),
('Bioclan 150', 'any', null, 'mg_per_kg', 150, 'mg', 'tablet', 11, 5.5, 11, null, null, null, null, null, null, null, 0.25, 'twice daily (cats once at 11)', null, 'Standard label dose'),
('Dalacin - Clindamycin 300mg (1 cap) ^', 'any', null, 'mg_per_kg', 300, 'mg', 'capsule', 11, 5.5, 11, null, null, null, null, null, null, null, 1, 'twice daily', null, 'Standard label dose'),
('Zodon (Clindamycin) 25mg', 'any', null, 'mg_per_kg', 25, 'mg', 'ml', 11, 5.5, 11, null, null, null, null, null, null, null, 0.1, 'twice daily', null, 'Standard label dose'),
('Marbocyl 5mg', 'any', null, 'mg_per_kg', 5, 'mg', 'tablet', 2, 2, 2.5, null, null, null, null, null, null, null, 0.25, 'daily', null, 'Dr Jim'),
('Marbo 20 MG', 'any', null, 'mg_per_kg', 20, 'mg', 'tablet', 2, 2, 2.5, null, null, null, null, null, null, null, 0.25, 'daily', null, 'Dr Jim'),
('Enroplus 50mg (per tab) ^', 'dog', null, 'mg_per_kg', 50, 'mg', 'tablet', 5, 5, 10, null, null, null, null, null, null, null, 0.25, 'daily', null, 'Standard label dose'),
('Enroplus 50mg (per tab) ^', 'cat', null, 'mg_per_kg', 50, 'mg', 'tablet', 5, 2.5, 5, null, null, null, null, null, null, null, 0.25, 'daily', 'Cats max 5 mg/kg (retina)', 'Standard label dose'),
('Azitrovet 100mg (per tab) ^', 'any', null, 'mg_per_kg', 100, 'mg', 'tablet', 10, 5, 10, null, null, null, null, null, null, null, 0.25, 'daily', null, 'Standard label dose'),
('Azitrovet 250mg (per tab) ^', 'any', null, 'mg_per_kg', 250, 'mg', 'tablet', 10, 5, 10, null, null, null, null, null, null, null, 0.25, 'daily', null, 'Standard label dose'),
('Azitrokir M 100 (per tab)', 'any', null, 'mg_per_kg', 100, 'mg', 'tablet', 10, 5, 10, null, null, null, null, null, null, null, 0.25, 'daily', null, 'Standard label dose'),
('Therios Palatable Tablets  (cefalexin monohydrate) 75 mg_x0000_', 'any', null, 'mg_per_kg', 75, 'mg', 'tablet', 15, 15, 30, null, null, null, null, null, null, null, 0.25, 'twice daily', null, 'Standard label dose'),
('Therios Palatable Tablets (cefalexin monohydrate) 300mg _x0000_', 'any', null, 'mg_per_kg', 300, 'mg', 'tablet', 15, 15, 30, null, null, null, null, null, null, null, 0.25, 'twice daily', null, 'Standard label dose'),
('Therios Palatable Tablets (cefalexin monohydrate) 750 mg _x0000_', 'any', null, 'mg_per_kg', 750, 'mg', 'tablet', 15, 15, 30, null, null, null, null, null, null, null, 0.25, 'twice daily', null, 'Standard label dose'),
('Benazecare 5mg (per tab) ^', 'dog', null, 'mg_per_kg', 5, 'mg', 'tablet', 0.25, 0.25, 0.5, null, null, null, null, null, null, null, 0.25, 'daily', null, 'Standard label dose'),
('Benazecare 5mg (per tab) ^', 'cat', null, 'mg_per_kg', 5, 'mg', 'tablet', 0.5, 0.5, 1, null, null, null, null, null, null, null, 0.25, 'daily', null, 'Standard label dose'),
('Omeprazole 2.5mg (per tab ) ^', 'any', null, 'mg_per_kg', 2.5, 'mg', 'tablet', 1, 0.7, 1, null, null, null, null, null, null, null, 0.25, 'once or twice daily', null, 'Standard label dose'),
('Omeprazole 5mg (per tab) ^', 'any', null, 'mg_per_kg', 5, 'mg', 'tablet', 1, 0.7, 1, null, null, null, null, null, null, null, 0.25, 'once or twice daily', null, 'Standard label dose'),
('Carprotab 50mg (per Tab) ^', 'dog', null, 'mg_per_kg', 50, 'mg', 'tablet', 4, 2, 4, null, null, null, null, null, null, null, 0.25, 'daily (or 2 mg/kg twice)', 'Not for cats', 'Standard label dose'),
('Carprotab 100mg (per Tab) ^', 'dog', null, 'mg_per_kg', 100, 'mg', 'tablet', 4, 2, 4, null, null, null, null, null, null, null, 0.25, 'daily (or 2 mg/kg twice)', 'Not for cats', 'Standard label dose'),
('Prednisolone 20mg', 'any', null, 'mg_per_kg', 20, 'mg', 'tablet', 1, 0.5, 2, null, null, null, null, null, null, null, 0.25, 'daily', '2 mg/kg for immunosuppression', 'Standard label dose'),
('Prednovet 20mg (per tab) ^', 'any', null, 'mg_per_kg', 20, 'mg', 'tablet', 1, 0.5, 2, null, null, null, null, null, null, null, 0.25, 'daily', '2 mg/kg for immunosuppression', 'Standard label dose'),
('Kiropred (Prednisolone) 20mg per tab', 'any', null, 'mg_per_kg', 20, 'mg', 'tablet', 1, 0.5, 2, null, null, null, null, null, null, null, 0.25, 'daily', '2 mg/kg for immunosuppression', 'Standard label dose'),
('Kiropred (prednisolone) 5mg per tab', 'any', null, 'mg_per_kg', 5, 'mg', 'tablet', 1, 0.5, 2, null, null, null, null, null, null, null, 0.25, 'daily', '2 mg/kg for immunosuppression', 'Standard label dose'),
('Apoquel 3.6mg (per tab) ^', 'dog', null, 'mg_per_kg', 3.6, 'mg', 'tablet', 0.5, 0.4, 0.6, null, null, null, null, null, null, null, 0.25, 'twice daily 14 days, then daily', 'Dogs over 12 months only', 'Standard label dose'),
('Apoquel 5.4mg (per tab) ^', 'dog', null, 'mg_per_kg', 5.4, 'mg', 'tablet', 0.5, 0.4, 0.6, null, null, null, null, null, null, null, 0.25, 'twice daily 14 days, then daily', 'Dogs over 12 months only', 'Standard label dose'),
('Apoquel 16mg (per tab) ^', 'dog', null, 'mg_per_kg', 16, 'mg', 'tablet', 0.5, 0.4, 0.6, null, null, null, null, null, null, null, 0.25, 'twice daily 14 days, then daily', 'Dogs over 12 months only', 'Standard label dose'),
('Cardisure 1.25mg (per tab)', 'dog', null, 'mg_per_kg', 1.25, 'mg', 'tablet', 0.25, 0.2, 0.3, null, null, null, null, null, null, null, 0.25, 'twice daily', null, 'Standard label dose'),
('Cardisure CHEW 2.5mg ^ (per tab)', 'dog', null, 'mg_per_kg', 2.5, 'mg', 'tablet', 0.25, 0.2, 0.3, null, null, null, null, null, null, null, 0.25, 'twice daily', null, 'Standard label dose'),
('Cardisure CHEW 5mg ^  (per tab)', 'dog', null, 'mg_per_kg', 5, 'mg', 'tablet', 0.25, 0.2, 0.3, null, null, null, null, null, null, null, 0.25, 'twice daily', null, 'Standard label dose'),
('Frudix 40mg (per tab)', 'any', null, 'mg_per_kg', 40, 'mg', 'tablet', 2, 1, 4, null, null, null, null, null, null, null, 0.25, '1 to 3 times daily', null, 'Standard label dose'),
('Fusix (Furosemide) 40mg per Tablet', 'any', null, 'mg_per_kg', 40, 'mg', 'tablet', 2, 1, 4, null, null, null, null, null, null, null, 0.25, '1 to 3 times daily', null, 'Standard label dose'),
('Lasix 40mg - (Furosemide)', 'any', null, 'mg_per_kg', 40, 'mg', 'tablet', 2, 1, 4, null, null, null, null, null, null, null, 0.25, '1 to 3 times daily', null, 'Standard label dose'),
('Furosemide Syrup 1% (10mg) 60ml - Dogs', 'any', null, 'mg_per_kg', 10, 'mg', 'ml', 2, 1, 4, null, null, null, null, null, null, null, 0.1, '1 to 3 times daily', null, 'Standard label dose'),
('Furosemide Syrup 1% 60ml ^', 'any', null, 'mg_per_kg', 10, 'mg', 'ml', 2, 1, 4, null, null, null, null, null, null, null, 0.1, '1 to 3 times daily', null, 'Standard label dose'),
('Vetoryl 10mg per tablet', 'dog', null, 'mg_per_kg', 10, 'mg', 'capsule', 1, 0.5, 2, null, null, null, null, null, null, null, 1, 'once or twice daily', 'Adjust by ACTH test', 'Standard label dose'),
('Vetoryl 30mg per tablet', 'dog', null, 'mg_per_kg', 30, 'mg', 'capsule', 1, 0.5, 2, null, null, null, null, null, null, null, 1, 'once or twice daily', 'Adjust by ACTH test', 'Standard label dose'),
('Vetoryl 60mg per tablet^', 'dog', null, 'mg_per_kg', 60, 'mg', 'capsule', 1, 0.5, 2, null, null, null, null, null, null, null, 1, 'once or twice daily', 'Adjust by ACTH test', 'Standard label dose'),
('Gabapet (100mg)', 'any', null, 'mg_per_kg', 100, 'mg', 'capsule', 10, 5, 20, null, null, null, null, null, null, null, 1, '2 to 3 times daily', 'Cats pre-visit: 50 to 100 mg per cat', 'Standard label dose'),
('Meloxivet Gotas 0.5 mg/ml (Oral drops)', 'cat', null, 'mg_per_kg', 0.5, 'mg', 'ml', 0.05, 0.05, 0.1, null, null, null, null, null, null, null, 0.05, 'daily (0.1 mg/kg day 1)', null, 'Standard label dose'),
('Meloxivet Gotas 0.5 mg/ml (Oral drops)', 'dog', null, 'mg_per_kg', 0.5, 'mg', 'ml', 0.1, 0.1, 0.2, null, null, null, null, null, null, null, 0.05, 'daily (0.2 mg/kg day 1)', null, 'Standard label dose'),
('Animeloxan oral 1.5mg/ml', 'cat', null, 'mg_per_kg', 1.5, 'mg', 'ml', 0.05, 0.05, 0.1, null, null, null, null, null, null, null, 0.05, 'daily (0.1 mg/kg day 1)', null, 'Standard label dose'),
('Animeloxan oral 1.5mg/ml', 'dog', null, 'mg_per_kg', 1.5, 'mg', 'ml', 0.1, 0.1, 0.2, null, null, null, null, null, null, null, 0.05, 'daily (0.2 mg/kg day 1)', null, 'Standard label dose'),
('Propentotab 100mg per tablet (vitofullin)', 'dog', null, 'mg_per_kg', 100, 'mg', 'tablet', 3, 3, 5, null, null, null, null, null, null, null, 0.25, 'twice daily', null, 'Standard label dose'),
('Clomav 5mg', 'dog', null, 'mg_per_kg', 5, 'mg', 'tablet', 2, 1, 2, null, null, null, null, null, null, null, 0.25, 'twice daily', null, 'Standard label dose'),
('Clomav 20mg', 'dog', null, 'mg_per_kg', 20, 'mg', 'tablet', 2, 1, 2, null, null, null, null, null, null, null, 0.25, 'twice daily', null, 'Standard label dose'),
('Clomav 80mg', 'dog', null, 'mg_per_kg', 80, 'mg', 'tablet', 2, 1, 2, null, null, null, null, null, null, null, 0.25, 'twice daily', null, 'Standard label dose'),
('Deworming tablet - Vermis-EX ^', 'any', null, 'bands', null, null, 'tablet', null, null, null, null, null, '[{"max_kg": 2.5, "amount": 0.25}, {"max_kg": 5, "amount": 0.5}, {"max_kg": 10, "amount": 1}, {"max_kg": 20, "amount": 2}]'::jsonb, 10, 1, null, null, null, 'once', 'Then 1 more tablet per 10 kg', null),
('Bravecto Dog 112.5mg (2-4.5kg) ^', 'dog', null, 'per_animal', null, null, 'tablet', null, null, null, 1, null, null, null, null, 2, 4.5, null, 'every 12 weeks', 'For 2 to 4.5 kg', null),
('Bravecto Dog 250mg (>4.5-10kg) ^', 'dog', null, 'per_animal', null, null, 'tablet', null, null, null, 1, null, null, null, null, 4.5, 10, null, 'every 12 weeks', 'For 4.5 to 10 kg', null),
('Bravecto Dog 500mg (>10-20kg) ^', 'dog', null, 'per_animal', null, null, 'tablet', null, null, null, 1, null, null, null, null, 10, 20, null, 'every 12 weeks', 'For 10 to 20 kg', null),
('Bravecto Dog 1000mg (>20-40kg) ^', 'dog', null, 'per_animal', null, null, 'tablet', null, null, null, 1, null, null, null, null, 20, 40, null, 'every 12 weeks', 'For 20 to 40 kg', null),
('Bravecto Dog 1400mg (<40-56 kg) ^', 'dog', null, 'per_animal', null, null, 'tablet', null, null, null, 1, null, null, null, null, 40, 56, null, 'every 12 weeks', 'For 40 to 56 kg', null),
('Bravecto Cat Sml 112.5gm ^', 'cat', null, 'per_animal', null, null, 'pipette', null, null, null, 1, null, null, null, null, 1.2, 2.8, null, 'every 12 weeks', 'For 1.2 to 2.8 kg', null),
('Bravecto Cat Med. 250mg ^', 'cat', null, 'per_animal', null, null, 'pipette', null, null, null, 1, null, null, null, null, 2.8, 6.25, null, 'every 12 weeks', 'For 2.8 to 6.25 kg', null),
('Bravecto Cat Lge 500mg ^', 'cat', null, 'per_animal', null, null, 'pipette', null, null, null, 1, null, null, null, null, 6.25, 12.5, null, 'every 12 weeks', 'For 6.25 to 12.5 kg', null),
('Mirataz (Mirtazapine) ointment', 'cat', null, 'note', null, null, 'ribbon', null, null, null, null, null, null, null, null, null, null, null, 'daily, 14 days', '1.5 inch ribbon on the inner ear', null)
) as v(name, species, variant, rule, strength, strength_unit, dose_unit, dose_per_kg, min_per_kg, max_per_kg, fixed_amount, amount_per_kg, bands, band_step_kg, band_step_amount, weight_min_kg, weight_max_kg, round_to, frequency, notes, source)
join goods_services g on g.name = v.name
where not exists (
  select 1 from dose_guidelines d
  where d.goods_service_id = g.id and d.species = v.species and coalesce(d.variant, '') = coalesce(v.variant, '')
);
