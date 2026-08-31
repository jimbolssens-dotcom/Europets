-- Migration 005: consult medical record, diagnostics, treatment plans,
-- file attachments, surgical/dental reports, and hospitalization.
-- "Visits" become "Consults" in the UI; the underlying table stays named
-- `visits` to avoid rewriting every existing foreign key.

-- ============ CONSULT FIELDS ON VISITS ============
alter table visits add column weight_kg numeric(6,2);
alter table visits add column temperature_c numeric(4,1);
alter table visits add column body_condition_score smallint check (body_condition_score between 1 and 9);
alter table visits add column anamnesis text;
alter table visits add column findings text;
alter table visits add column prognosis text;
alter table visits add column treatment_notes text;

-- ============ DIAGNOSTICS ============
create table diagnostics (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid references visits(id) on delete cascade not null,
    type text not null,              -- 'blood_test', 'xray', 'ultrasound', 'other'
    description text,
    result text,
    created_at timestamptz default now()
);

-- ============ TREATMENT PLAN ITEMS ============
-- Planned treatment referencing the catalog (medications, procedures, ...).
-- Not linked to invoicing yet — that comes later.
create table treatment_items (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid references visits(id) on delete cascade not null,
    goods_service_id uuid references goods_services(id),
    instructions text,               -- dosage / frequency / duration
    quantity numeric(10,2) default 1,
    created_at timestamptz default now()
);

-- ============ SURGICAL REPORTS ============
create table surgical_reports (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid references visits(id) on delete cascade not null,
    surgeon_id uuid references staff(id),
    procedure_name text,
    notes text,
    performed_at timestamptz default now(),
    created_at timestamptz default now()
);

-- ============ DENTAL REPORTS ============
create table dental_reports (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid references visits(id) on delete cascade not null,
    performed_by uuid references staff(id),
    findings text,
    procedures_performed text,
    notes text,
    performed_at timestamptz default now(),
    created_at timestamptz default now()
);

-- ============ HOSPITALIZATION ============
-- Standalone multi-day admission, optionally started from a consult.
create table hospitalizations (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid references patients(id) not null,
    client_id uuid references clients(id) not null,
    originating_visit_id uuid references visits(id),
    room_id uuid references rooms(id),
    admitted_at timestamptz default now(),
    discharged_at timestamptz,
    status text not null default 'admitted',  -- 'admitted', 'discharged'
    reason text,
    created_at timestamptz default now()
);

-- Day-to-day worksheet entries for an admitted patient.
create table hospitalization_notes (
    id uuid primary key default gen_random_uuid(),
    hospitalization_id uuid references hospitalizations(id) on delete cascade not null,
    author_id uuid references staff(id),
    note_date date not null default current_date,
    appetite text,                   -- e.g. 'good', 'reduced', 'none'
    condition text,                  -- general condition summary
    temperature_c numeric(4,1),
    notes text,
    created_at timestamptz default now()
);

-- ============ ATTACHMENTS ============
-- Generic file attachment, reusable across diagnostics, reports, and
-- hospitalization notes. Files live in the "consult-files" Storage bucket.
create table attachments (
    id uuid primary key default gen_random_uuid(),
    entity_type text not null,       -- 'diagnostic', 'surgical_report', 'dental_report', 'hospitalization_note'
    entity_id uuid not null,
    file_path text not null,         -- path within the consult-files bucket
    file_name text,
    content_type text,
    uploaded_by uuid references staff(id),
    created_at timestamptz default now()
);
create index idx_attachments_entity on attachments(entity_type, entity_id);

-- ============ STORAGE BUCKET ============
-- Public bucket for consult/report file attachments. No staff auth yet,
-- so — consistent with RLS being off everywhere else — access is open.
insert into storage.buckets (id, name, public)
values ('consult-files', 'consult-files', true)
on conflict (id) do nothing;

create policy "Public read consult-files" on storage.objects
    for select using (bucket_id = 'consult-files');
create policy "Public upload consult-files" on storage.objects
    for insert with check (bucket_id = 'consult-files');
create policy "Public delete consult-files" on storage.objects
    for delete using (bucket_id = 'consult-files');

-- ============ RLS ============
-- Same posture as every other table: no staff auth yet, so RLS stays off.
alter table diagnostics disable row level security;
alter table treatment_items disable row level security;
alter table surgical_reports disable row level security;
alter table dental_reports disable row level security;
alter table hospitalizations disable row level security;
alter table hospitalization_notes disable row level security;
alter table attachments disable row level security;

-- ============ REALTIME ============
alter publication supabase_realtime add table
    diagnostics, treatment_items, surgical_reports, dental_reports,
    hospitalizations, hospitalization_notes, attachments;
