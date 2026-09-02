-- Migration 021: consent forms signed when a pet is left in the clinic's
-- care — surgery (split into standard neutering vs. complex/high-risk),
-- hospitalization, and dental. Each signed form's exact text is snapshotted
-- at signing time (form_text), so it stays legally accurate to what the
-- client actually agreed to even if the canonical template wording changes
-- later. Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists consent_forms (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid references patients(id) not null,
    client_id uuid references clients(id) not null,
    visit_id uuid references visits(id),                    -- surgery/dental forms
    hospitalization_id uuid references hospitalizations(id), -- hospitalization forms
    form_type text not null check (
        form_type in ('surgery_standard_neuter', 'surgery_complex', 'hospitalization', 'dental')
    ),
    form_text text not null,
    signed_by_name text not null,
    signed_by_relationship text,          -- e.g. 'Owner', 'Authorized Agent' — optional
    staff_witness_id uuid references staff(id),
    signed_at timestamptz not null default now(),
    created_at timestamptz default now()
);

create index if not exists idx_consent_forms_visit on consent_forms(visit_id);
create index if not exists idx_consent_forms_hospitalization on consent_forms(hospitalization_id);
create index if not exists idx_consent_forms_patient on consent_forms(patient_id);
