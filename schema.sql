-- Vet Clinic Management System — Database Schema (v1)
-- Target: Postgres (Supabase)

-- ============ STAFF ============
create table staff (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    role text not null,              -- 'vet', 'tech', 'reception', 'admin'
    email text unique,
    created_at timestamptz default now()
);

-- ============ CLIENTS ============
create table clients (
    id uuid primary key default gen_random_uuid(),
    client_number bigint generated always as identity unique,  -- human-facing client number
    full_name text not null,
    phone text,
    phone2 text,
    phone2_label text,       -- who the second number belongs to: 'husband', 'wife', 'maid', 'driver', 'other'
    emirates_id text,        -- UAE Emirates ID number, typed or read off a scanned card
    trn text,                -- client's own VAT Tax Registration Number, if a registered business
    email text,
    address text,
    created_at timestamptz default now()
);

-- ============ PATIENTS ============
create table patients (
    id uuid primary key default gen_random_uuid(),
    patient_number bigint generated always as identity unique,  -- human-facing patient number
    client_id uuid references clients(id) on delete cascade,
    name text not null,
    species text not null,           -- dog, cat, etc.
    breed text,
    date_of_birth date,
    sex text,                        -- 'male', 'female', 'unknown'
    current_weight_kg numeric(6,2),  -- updated at each visit; used for per-kg pricing
    microchip_number text unique,    -- ISO microchip number, if chipped
    deceased boolean not null default false,
    notes text,
    created_at timestamptz default now()
);

-- ============ ROOMS ============
create table rooms (
    id uuid primary key default gen_random_uuid(),
    name text not null,              -- 'Room 1', 'Room 2', 'Surgery'
    type text not null default 'consult'  -- 'consult' or 'surgery'
);

-- ============ APPOINTMENTS ============
create table appointments (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid references patients(id),
    client_id uuid references clients(id),
    room_id uuid references rooms(id),
    vet_id uuid references staff(id),
    type text not null default 'consult',   -- 'consult' or 'surgery'
    start_time timestamptz not null,
    duration_minutes int not null default 15,  -- 15 for consult; 10-increment for surgery
    status text not null default 'booked',  -- booked, checked_in, in_progress, complete, cancelled
    reason text,
    created_at timestamptz default now()
);

-- ============ VISITS (a.k.a. Consults) ============
-- Created when an appointment is checked in (or walk-in). Called "Consults"
-- in the UI; kept named `visits` here to avoid rewriting every foreign key.
create table visits (
    id uuid primary key default gen_random_uuid(),
    appointment_id uuid references appointments(id),
    patient_id uuid references patients(id) not null,
    client_id uuid references clients(id) not null,
    room_id uuid references rooms(id),
    attending_vet_id uuid references staff(id),
    status text not null default 'in_progress',  -- in_progress, complete
    started_at timestamptz default now(),
    ended_at timestamptz,
    weight_kg numeric(6,2),          -- weight recorded at this consult
    temperature_c numeric(4,1),
    body_condition_score smallint check (body_condition_score between 1 and 9),
    anamnesis text,                  -- client-reported history / complaint
    findings text,                   -- physical exam findings
    prognosis text,
    treatment_notes text
);

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
-- Not linked to invoicing yet.
create table treatment_items (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid references visits(id) on delete cascade not null,
    goods_service_id uuid references goods_services(id),
    instructions text,               -- dosage / frequency / duration
    quantity numeric(10,2) default 1,
    created_at timestamptz default now()
);

-- ============ VACCINE PROTOCOLS ============
-- The clinic's standard vaccination catalog, species-tagged so the UI can
-- filter to just what makes sense for a given patient.
create table vaccine_protocols (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    species text not null,               -- 'cat' or 'dog'
    core boolean not null default true,  -- core (routine) vs optional (e.g. Kennel Cough)
    interval_months int not null default 12,  -- how often it's due again; 12 = annual
    is_rabies boolean not null default false,  -- lets the app find "the rabies protocol
                                                -- for this species" without string-matching
                                                -- on the (renameable) display name
    active boolean not null default true,
    created_at timestamptz default now()
);

-- ============ VACCINATIONS ============
-- One row per vaccine given to a patient — or scheduled but not yet given
-- (date_given null), for a rabies reminder created by "Mark as Primary"
-- when rabies wasn't part of that primary visit. vaccine_name is copied
-- from the protocol at entry time so renaming/retiring a protocol later
-- never rewrites a patient's history. next_due_date defaults to
-- date_given + the protocol's interval but stays editable. is_primary
-- flags a row as part of a primary (puppy/kitten) course — its booster is
-- due in 1 month rather than the normal annual cycle. reminder_sent_at
-- tracks whether staff already drafted a reminder for the current due
-- date, so the due list doesn't nag about the same one twice.
create table vaccinations (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid references patients(id) on delete cascade not null,
    vaccine_protocol_id uuid references vaccine_protocols(id),
    vaccine_name text not null,
    date_given date,
    next_due_date date,
    batch_number text,
    administered_by uuid references staff(id),
    notes text,
    is_primary boolean not null default false,
    reminder_sent_at timestamptz,
    created_at timestamptz default now()
);

insert into vaccine_protocols (name, species, core, interval_months, is_rabies) values
    ('PCH (Feline Flu + Enteritis)', 'cat', true, 12, false),
    ('Rabies', 'cat', true, 12, true),
    ('DHPPi + Lepto', 'dog', true, 12, false),
    ('Rabies', 'dog', true, 12, true),
    ('Kennel Cough', 'dog', false, 12, false);

-- ============ INTAKE REQUESTS ============
-- New-client self-service intake: staff generate a blank row (a shareable
-- link keyed by its own id, e.g. sent over WhatsApp when someone calls as
-- a first-time client) and the prospective client fills in their own and
-- their pet(s)' details from the public portal before ever setting foot in
-- the clinic. Submissions land here — not directly in clients/patients —
-- so staff review and approve (or reject) each one; approving creates the
-- real client and patient rows.
create table intake_requests (
    id uuid primary key default gen_random_uuid(),
    status text not null default 'pending',  -- pending (link sent, not filled in yet),
                                              -- submitted (filled in, awaiting staff review),
                                              -- approved, rejected
    sent_to_phone text,  -- the number staff sent the link to (not the client's own phone —
                          -- that's the `phone` field below, filled in by the client themselves)
    full_name text,
    phone text,
    email text,
    address text,
    emirates_id text,
    patients jsonb not null default '[]',  -- [{name, species, breed, date_of_birth, sex, microchip_number}], filled in by the client
    notes text,
    submitted_at timestamptz,
    reviewed_at timestamptz,
    client_id uuid references clients(id),  -- set once approved
    created_at timestamptz default now()
);

-- ============ SURGICAL REPORTS ============
create table surgical_reports (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid references visits(id) on delete cascade not null,
    surgeon_id uuid references staff(id),
    procedure_name text,
    notes text,
    ai_summary text,          -- populated by AI summarization of a recorded surgery
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
    created_at timestamptz default now(),
    updated_at timestamptz default now()   -- bumped on every edit, so multiple touches in a day are visible
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

-- ============ CONSULT NOTES ============
create table consult_notes (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid references visits(id) on delete cascade,
    author_id uuid references staff(id),
    note_text text,
    ai_summary text,          -- populated later by AI summarization
    created_at timestamptz default now()
);

-- ============ AI RECORDINGS ============
-- Ambient audio captured during a consult or surgery. Recorded in the
-- browser, uploaded to the consult-files bucket, then transcribed
-- (AssemblyAI) and summarized (Claude) asynchronously via a webhook. The
-- resulting summary is folded into consult_notes (for a visit) or
-- surgical_reports.ai_summary (for a surgery).
create table recordings (
    id uuid primary key default gen_random_uuid(),
    entity_type text not null,       -- 'visit' or 'surgical_report'
    entity_id uuid not null,
    file_path text not null,         -- path within the consult-files bucket
    file_name text,
    status text not null default 'processing',  -- 'processing', 'done', 'error'
    transcript text,
    summary text,
    error_message text,
    assemblyai_transcript_id text,
    created_at timestamptz default now()
);

-- ============ CLINIC SETTINGS ============
-- Singleton row (id can only ever be `true`) holding the clinic's own
-- identity for tax invoices — legal name, TRN, address — editable from
-- the app's Settings page rather than hardcoded.
create table clinic_settings (
    id boolean primary key default true check (id),
    legal_name text not null default 'Europets Veterinary Clinic',
    trn text,
    address text,
    phone text,
    email text,
    updated_at timestamptz default now()
);
insert into clinic_settings (id) values (true) on conflict do nothing;

-- ============ GOODS & SERVICES ============
create table goods_services (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    category text not null,          -- 'medication', 'food', 'toy', 'product', 'service', 'procedure'
    pricing_type text not null default 'flat',  -- 'flat', 'per_kg', 'per_unit'
    base_price numeric(10,2) not null,
    unit text,                       -- e.g. 'mg', 'ml', 'kg' (used when pricing_type != flat)
    active boolean default true,
    created_at timestamptz default now()
);

-- ============ INVOICES ============
create table invoices (
    id uuid primary key default gen_random_uuid(),
    invoice_number bigint generated always as identity unique,  -- sequential, for FTA tax invoices
    visit_id uuid references visits(id),
    client_id uuid references clients(id) not null,
    subtotal numeric(10,2) not null default 0,
    vat_amount numeric(10,2) not null default 0,   -- 5% UAE VAT
    total numeric(10,2) not null default 0,
    status text not null default 'unpaid',  -- unpaid, paid, void
    created_at timestamptz default now()
);

create table invoice_line_items (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid references invoices(id) on delete cascade,
    goods_service_id uuid references goods_services(id),
    description text,
    quantity numeric(10,2) not null default 1,   -- e.g. kg of bodyweight for per_kg items
    unit_price numeric(10,2) not null,
    line_total numeric(10,2) not null            -- pre-VAT
);

-- ============ VAT CONSTANT ============
-- Kept simple as an app-level constant for now: UAE standard VAT = 5%
-- (invoice totals computed in application logic: vat_amount = subtotal * 0.05)

-- ============ INDEXES ============
create index idx_patients_client on patients(client_id);
create index idx_appointments_room_time on appointments(room_id, start_time);
create index idx_visits_patient on visits(patient_id);
create index idx_consult_notes_visit on consult_notes(visit_id);
create index idx_invoice_line_items_invoice on invoice_line_items(invoice_id);
create index idx_diagnostics_visit on diagnostics(visit_id);
create index idx_treatment_items_visit on treatment_items(visit_id);
create index idx_surgical_reports_visit on surgical_reports(visit_id);
create index idx_dental_reports_visit on dental_reports(visit_id);
create index idx_hospitalizations_patient on hospitalizations(patient_id);
create index idx_hospitalization_notes_hosp on hospitalization_notes(hospitalization_id);
create index idx_attachments_entity on attachments(entity_type, entity_id);
create index idx_recordings_entity on recordings(entity_type, entity_id);
create index idx_vaccinations_patient on vaccinations(patient_id);
create index idx_vaccinations_due_date on vaccinations(next_due_date);
create index idx_intake_requests_status on intake_requests(status);

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

-- ============ REALTIME ============
-- The app subscribes to postgres_changes on these tables (patient list,
-- appointment calendar, active consults board, live consult notes,
-- diagnostics, treatment plan, invoice line items) — they must be in the
-- supabase_realtime publication for those subscriptions to receive anything.
alter publication supabase_realtime add table
    clients, patients, appointments, visits, consult_notes, invoices, invoice_line_items,
    diagnostics, treatment_items, surgical_reports, dental_reports,
    hospitalizations, hospitalization_notes, attachments, recordings, clinic_settings,
    vaccine_protocols, vaccinations, intake_requests;

-- ============ ROW LEVEL SECURITY ============
-- RLS is intentionally left disabled: the app has no staff auth yet and
-- talks to Supabase directly with the publishable key. Enable RLS and add
-- policies (e.g. scoped to authenticated staff) before this goes anywhere
-- near production data.
--
-- Newer Supabase projects auto-enable RLS by default on new tables, so
-- this is explicit rather than relying on Postgres's off-by-default.
alter table staff disable row level security;
alter table clients disable row level security;
alter table patients disable row level security;
alter table rooms disable row level security;
alter table appointments disable row level security;
alter table visits disable row level security;
alter table consult_notes disable row level security;
alter table goods_services disable row level security;
alter table invoices disable row level security;
alter table invoice_line_items disable row level security;
alter table diagnostics disable row level security;
alter table treatment_items disable row level security;
alter table surgical_reports disable row level security;
alter table dental_reports disable row level security;
alter table hospitalizations disable row level security;
alter table hospitalization_notes disable row level security;
alter table attachments disable row level security;
alter table recordings disable row level security;
alter table clinic_settings disable row level security;
alter table vaccine_protocols disable row level security;
alter table vaccinations disable row level security;
alter table intake_requests disable row level security;
