-- Migration 249: prescriptions (Jim, 12 Nov)
--
-- A prescription for an owner to buy medicine at an outside pharmacy,
-- written from the patient file (More menu, app/_components/
-- PrescriptionPanel.jsx), sent as a PDF by WhatsApp or email
-- (lib/prescriptionPdf.js, GET /api/prescriptions/:id/pdf).
--
-- rx_number: the prescription's own running number (RX-000123).
-- items: [{ name, strength, quantity, directions, duration }].
-- vet_id: the prescribing vet (their name and staff.licence_number print
-- on it).
--
-- Read and written only through the app's server routes (service role).
-- Adds a table. Safe to run more than once.

create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  rx_number bigserial unique,
  patient_id uuid not null references patients(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  vet_id uuid references staff(id) on delete set null,
  items jsonb not null default '[]'::jsonb,
  notes text,
  weight_kg numeric,
  created_at timestamptz not null default now()
);

create index if not exists prescriptions_patient_idx on prescriptions (patient_id, created_at desc);

alter table prescriptions enable row level security;
revoke all on prescriptions from anon, authenticated;
