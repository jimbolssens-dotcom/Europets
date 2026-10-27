-- Migration 231: export health certificates.
--
-- staff.licence_number   the vet's licence number, printed on the
--                        certificates they sign.
-- health_certificates    each certificate as issued: its number (HC-YY-NNN,
--                        counted per year with next_payment_sequence, prefix
--                        'HC-26'), the pet, the signing vet, and a snapshot of
--                        everything printed on it (data), so a reprint shows
--                        exactly what was certified that day even after the
--                        pet's records change. Built by
--                        lib/healthCertificatePdf.js from the patient page.
-- Safe to run more than once.

alter table staff add column if not exists licence_number text;

create table if not exists health_certificates (
    id uuid primary key default gen_random_uuid(),
    certificate_number text not null unique,
    patient_id uuid references patients(id) on delete cascade not null,
    vet_id uuid references staff(id) on delete set null,
    exam_date date not null,
    destination text,
    data jsonb not null,
    created_by uuid references staff(id) on delete set null,
    created_at timestamptz default now()
);
create index if not exists idx_health_certificates_patient on health_certificates(patient_id, created_at desc);

alter table health_certificates disable row level security;
