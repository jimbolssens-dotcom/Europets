-- Vaccination tracking: a species-filtered protocol catalog (Cat Flu,
-- Feline Enteritis, Rabies for cats; DHPPi+Lepto, Rabies, optional Kennel
-- Cough for dogs) plus per-patient vaccination records with a due date for
-- the reminders dashboard.

-- ============ VACCINE PROTOCOLS ============
-- The clinic's standard vaccination catalog, species-tagged so the UI can
-- filter to just what makes sense for a given patient.
create table vaccine_protocols (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    species text not null,               -- 'cat' or 'dog'
    core boolean not null default true,  -- core (routine) vs optional (e.g. Kennel Cough)
    interval_months int not null default 12,  -- how often it's due again; 12 = annual
    active boolean not null default true,
    created_at timestamptz default now()
);

insert into vaccine_protocols (name, species, core, interval_months) values
    ('Cat Flu', 'cat', true, 12),
    ('Feline Enteritis', 'cat', true, 12),
    ('Rabies', 'cat', true, 12),
    ('DHPPi + Lepto', 'dog', true, 12),
    ('Rabies', 'dog', true, 12),
    ('Kennel Cough', 'dog', false, 12);

-- ============ VACCINATIONS ============
-- One row per vaccine actually given to a patient. vaccine_name is copied
-- from the protocol at entry time so renaming/retiring a protocol later
-- never rewrites a patient's history. next_due_date defaults to
-- date_given + the protocol's interval but stays editable. reminder_sent_at
-- tracks whether staff already drafted a reminder for the current due
-- date, so the due list doesn't nag about the same one twice.
create table vaccinations (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid references patients(id) on delete cascade not null,
    vaccine_protocol_id uuid references vaccine_protocols(id),
    vaccine_name text not null,
    date_given date not null,
    next_due_date date,
    batch_number text,
    administered_by uuid references staff(id),
    notes text,
    reminder_sent_at timestamptz,
    created_at timestamptz default now()
);

create index idx_vaccinations_patient on vaccinations(patient_id);
create index idx_vaccinations_due_date on vaccinations(next_due_date);

alter publication supabase_realtime add table vaccine_protocols, vaccinations;

alter table vaccine_protocols disable row level security;
alter table vaccinations disable row level security;
