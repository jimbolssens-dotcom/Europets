-- Migration 061: remote consent-form signing.
--
-- Lets staff send a client a link (via WhatsApp) to review and digitally
-- sign a consent form themselves, instead of only signing in person on a
-- staff device. A request row tracks the link until it's used; on
-- submission it creates the real, authoritative row in consent_forms
-- (unchanged) the same way an in-person signature does.

create table consent_form_requests (
    id uuid primary key default gen_random_uuid(),
    status text not null default 'pending',  -- pending (link sent, not signed yet), submitted
    visit_id uuid references visits(id),                     -- surgery/dental forms
    hospitalization_id uuid references hospitalizations(id), -- hospitalization forms
    form_type text not null check (
        form_type in ('surgery_standard_neuter', 'surgery_complex', 'hospitalization', 'dental')
    ),
    sent_to_phone text,  -- the number staff sent the link to
    consent_form_id uuid references consent_forms(id),  -- set once signed
    created_at timestamptz default now(),
    submitted_at timestamptz
);

create index idx_consent_form_requests_visit on consent_form_requests(visit_id);
create index idx_consent_form_requests_hospitalization on consent_form_requests(hospitalization_id);

alter table consent_form_requests disable row level security;
