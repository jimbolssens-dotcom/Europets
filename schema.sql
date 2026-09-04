-- Vet Clinic Management System — Database Schema (v1)
-- Target: Postgres (Supabase)

-- ============ STAFF ============
create table staff (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    role text not null,              -- 'vet', 'tech', 'reception', 'cleaner', 'admin'
    email text unique,
    color text,                      -- chosen appointment-schedule color (hex);
                                      -- null falls back to the auto palette (migration 035)
    created_at timestamptz default now()
);

-- Real, date-based roster — "who's actually in on this specific date,
-- morning/afternoon". Presence is row existence: add someone in (insert)
-- or take them off (delete). This is the single source of truth for
-- whether a vet can be booked at a given date+shift — see
-- migrations/034_staff_roster.sql and migrations/044_drop_staff_schedules.sql
-- (which removed the earlier recurring weekly-template table).
create table staff_roster_entries (
    id uuid primary key default gen_random_uuid(),
    staff_id uuid references staff(id) on delete cascade not null,
    date date not null,
    shift text not null check (shift in ('morning', 'afternoon')),
    created_at timestamptz default now(),
    unique (staff_id, date, shift)
);
create index idx_staff_roster_entries_date on staff_roster_entries(date);
create index idx_staff_roster_entries_staff on staff_roster_entries(staff_id);

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

-- ============ CAGES ============
-- Fixed physical map of the clinic's hospitalization cages — separate
-- from `rooms` above (consult/surgery rooms for appointments), so cages
-- never show up in a room picker meant for booking a consult. The Cage
-- Layout page assigns an admitted hospitalization to one of these.
create table cages (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    group_name text not null,  -- 'standard', 'long_term', 'recovery', 'dog', 'isolation', 'post_op'
    is_oxygen_room boolean not null default false,
    sort_order int not null default 0
);

insert into cages (name, group_name, is_oxygen_room, sort_order) values
    ('Cage 1', 'standard', false, 1),
    ('Cage 2', 'standard', false, 2),
    ('Cage 3', 'standard', false, 3),
    ('Cage 4', 'standard', false, 4),
    ('Cage 5', 'standard', false, 5),
    ('Cage 6', 'standard', false, 6),
    ('Cage 7', 'standard', false, 7),
    ('Cage 8', 'standard', false, 8),
    ('Cage 9', 'standard', false, 9),
    ('Cage 10', 'standard', false, 10),
    ('Cage 11', 'standard', false, 11),
    ('Cage 12', 'standard', false, 12),
    ('LT 1', 'long_term', false, 1),
    ('LT 2', 'long_term', false, 2),
    ('LT 3', 'long_term', false, 3),
    ('LT 4', 'long_term', false, 4),
    ('LT 5', 'long_term', false, 5),
    ('R 1', 'recovery', false, 1),
    ('R 2', 'recovery', false, 2),
    ('R 3', 'recovery', false, 3),
    ('R 4', 'recovery', false, 4),
    ('D 1', 'dog', false, 1),
    ('D 2', 'dog', false, 2),
    ('D 3', 'dog', false, 3),
    ('D 4', 'dog', false, 4),
    ('ISO 1', 'isolation', false, 1),
    ('ISO 2', 'isolation', false, 2),
    ('ISO 3', 'isolation', false, 3),
    ('PT 1', 'post_op', false, 1),
    ('PT 2', 'post_op', false, 2),
    ('PT 3', 'post_op', true, 3),
    ('PT 4', 'post_op', false, 4),
    ('PT 5', 'post_op', false, 5);

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
    diagnosis text,
    prognosis text,
    treatment_notes text
);

-- ============ DIAGNOSTICS ============
-- goods_service_id and treatment_item_id are added further down (once
-- goods_services and treatment_items exist) — picking a catalog test here
-- automatically adds it to the treatment plan too.
create table diagnostics (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid references visits(id) on delete cascade not null,
    type text,                       -- legacy free-text ('blood_test', 'xray', ...); superseded
                                      -- by goods_service_id for new rows
    description text,
    result text,
    created_at timestamptz default now()
);

-- ============ CATALOG SUBCATEGORIES ============
-- The editable subdivisions under each of the three fixed main categories
-- (product/test/service) — e.g. more test types get added here over time
-- as the clinic starts offering them, without a code change.
-- Defined here (ahead of its usual place near invoices) since
-- goods_services references it — Postgres needs the referenced table to
-- already exist.
create table catalog_subcategories (
    id uuid primary key default gen_random_uuid(),
    main_category text not null check (main_category in ('product', 'test', 'service')),
    name text not null,
    active boolean not null default true,
    created_at timestamptz default now(),
    unique (main_category, name)
);

insert into catalog_subcategories (main_category, name) values
    ('product', 'Food'),
    ('product', 'Toys'),
    ('product', 'Medication'),
    ('product', 'Other'),
    ('test', 'X-Ray'),
    ('test', 'Ultrasound'),
    ('test', 'PCR'),
    ('test', 'Blood Pressure'),
    ('test', 'Blood Test - CBC'),
    ('test', 'Blood Test - GHP'),
    ('test', 'Urine'),
    ('service', 'Consults'),
    ('service', 'Surgeries'),
    ('service', 'Dental'),
    ('service', 'General');

-- ============ GOODS & SERVICES ============
-- Defined here (ahead of its usual place near invoices) since
-- treatment_items references it — Postgres needs the referenced table to
-- already exist.
create table goods_services (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    main_category text not null check (main_category in ('product', 'test', 'service')),
    subcategory_id uuid references catalog_subcategories(id),
    pricing_type text not null default 'flat',  -- 'flat', 'per_kg', 'per_unit'
    base_price numeric(10,2) not null,
    unit text,                       -- e.g. 'mg', 'ml', 'kg' (used when pricing_type != flat)
    active boolean default true,
    administration_method text check (administration_method in ('dispense', 'sc', 'im')),
        -- for a medication: how it's given, if it carries its own fee —
        -- applied automatically wherever the medication is added, as a
        -- second invoice line (see lib/invoicing.js)
    created_at timestamptz default now()
);

create index idx_goods_services_main_category on goods_services(main_category);
create index idx_goods_services_subcategory on goods_services(subcategory_id);

-- ============ TREATMENT PLAN ITEMS ============
-- Planned treatment referencing the catalog (medications, procedures, ...).
-- Not linked to invoicing yet.
-- hospitalization_note_id is added further down (once the
-- hospitalization_notes table exists) — a treatment item belongs to
-- exactly one of visit_id (a consult) or hospitalization_note_id (logged
-- as part of one day's worksheet entry during an admission), never both.
create table treatment_items (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid references visits(id) on delete cascade,
    goods_service_id uuid references goods_services(id),
    instructions text,               -- dosage / frequency / duration
    quantity numeric(10,2) default 1,
    administration_method text check (administration_method in ('dispense', 'sc', 'im')),
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
    postop_instructions text, -- owner-facing post-op care, AI-drafted from the
                               -- clinic's baseline + this report, then vet-reviewed
                               -- and saved before it's ever shared (see migration 033)
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
    ai_summary text,          -- populated by AI summarization of a recorded dental procedure
    postop_instructions text, -- see surgical_reports.postop_instructions above
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
    cage_id uuid references cages(id),  -- which physical cage this case is in — see Cage Layout page
    admitted_at timestamptz default now(),
    discharged_at timestamptz,
    status text not null default 'admitted',  -- 'admitted', 'discharged'
    reason text,
    update_requested_at timestamptz,  -- set by the client portal's "Request an Update" button; makes
                                       -- this case's cage blink on the Cage Layout page until cleared
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
    weight_kg numeric(6,2),
    notes text,
    -- Quick Check-In fields (see lib/hospitalizationCheckin.js) — a
    -- cleaner's simplified tile-based entry populates these instead of
    -- condition/notes. temperature_feel is a qualitative "feels warm/
    -- cold to the touch" flag, distinct from the clinical temperature_c
    -- reading above.
    stool text,                      -- 'normal', 'diarrhea', 'bloody'
    urine text,                      -- 'normal', 'orange', 'pale', 'bloody'
    vomit text,                      -- 'none', 'once', 'multiple'
    drinking text,                   -- 'good', 'reduced', 'none'
    mood text,                       -- 'happy', 'neutral', 'unhappy'
    temperature_feel text,           -- 'normal', 'warm', 'cold'
    medication_given text,           -- 'given' (single toggle, not a scale)
    force_feeding_done text,         -- 'done' (single toggle, not a scale)
    created_at timestamptz default now(),
    updated_at timestamptz default now()   -- bumped on every edit, so multiple touches in a day are visible
);

-- Deferred from treatment_items' own definition above, since it needs
-- this table to exist first — medications, goods/services, and tests
-- logged as part of a specific worksheet entry, consolidated into an
-- invoice (across every entry of the admission) at discharge.
alter table treatment_items add column hospitalization_note_id uuid
    references hospitalization_notes(id) on delete cascade;

-- Deferred from diagnostics' own definition above, since it needs
-- goods_services and treatment_items to exist first — a diagnostic can
-- link to the catalog test that was ordered, which automatically creates
-- a matching treatment_items line so it flows straight into the
-- treatment plan and invoice without a separate manual step. type stays
-- for legacy rows predating this; new diagnostics use goods_service_id
-- instead. on delete set null (not cascade) on treatment_item_id — if the
-- line is removed straight from the treatment plan, the diagnostic and
-- its results/attachments stay, just unbilled.
alter table diagnostics alter column type drop not null;
alter table diagnostics add column goods_service_id uuid references goods_services(id);
alter table diagnostics add column treatment_item_id uuid references treatment_items(id) on delete set null;

-- ============ CONSENT FORMS ============
-- Signed when a pet is left in the clinic's care — surgery (standard
-- neutering vs. complex/high-risk), hospitalization, or dental. Each
-- signed form's exact text is snapshotted at signing time (form_text), so
-- it stays legally accurate to what the client actually agreed to even if
-- the canonical template wording changes later. See lib/consentTemplates.js.
create table consent_forms (
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

create index idx_consent_forms_visit on consent_forms(visit_id);
create index idx_consent_forms_hospitalization on consent_forms(hospitalization_id);
create index idx_consent_forms_patient on consent_forms(patient_id);

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

-- ============ PATIENT ALERTS ============
-- Long-term, patient-level notes — "aggressive with handling", "allergic
-- to penicillin", "reacted badly to the rabies vaccine" — that persist
-- across the patient's whole record, not tied to any one visit. Entered
-- from a consult (where a vet would first notice something worth
-- flagging) but shown on the patient's own page too, so it's visible the
-- moment anyone pulls up that patient. Deliberately separate from
-- consult_notes (per-visit) and patients.notes (a single free-text field).
create table patient_alerts (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid references patients(id) on delete cascade not null,
    author_id uuid references staff(id),
    note_text text not null,
    created_at timestamptz default now()
);

create index idx_patient_alerts_patient on patient_alerts(patient_id);

-- ============ AI RECORDINGS ============
-- Ambient audio captured during a consult or surgery. Recorded in the
-- browser, uploaded to the consult-files bucket, then transcribed
-- (AssemblyAI) and summarized (Claude) asynchronously via a webhook. The
-- resulting summary is folded into consult_notes (for a visit) or
-- surgical_reports.ai_summary (for a surgery).
create table recordings (
    id uuid primary key default gen_random_uuid(),
    entity_type text not null,       -- 'visit', 'surgical_report', or 'hospitalization'
    entity_id uuid not null,
    file_path text not null,         -- path within the consult-files bucket
    file_name text,
    status text not null default 'processing',  -- 'processing', 'done', 'error'
    transcript text,
    summary text,
    -- Structured fields extracted from a 'hospitalization' recording
    -- (appetite/weight/temperature/condition/notes + matched catalog
    -- items) — that worksheet entry doesn't exist as a row yet at
    -- recording time, so this is where the extraction lands instead;
    -- the page reads it back into the still-unsaved draft form. Null for
    -- 'visit'/'surgical_report' recordings, which write straight onto
    -- their (already-existing) row instead.
    extracted_fields jsonb,
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
    phone2 text,       -- a second clinic landline
    email text,
    dispensing_fee numeric(10,2) not null default 0,
    sc_injection_fee numeric(10,2) not null default 0,
    im_injection_fee numeric(10,2) not null default 0,
    -- Standard post-op care instructions per procedure type, edited/
    -- approved on the Settings page — the starting point every AI-drafted
    -- post-op release form is built from (see migration 033).
    surgical_postop_baseline text,
    dental_postop_baseline text,
    updated_at timestamptz default now()
);
insert into clinic_settings (id) values (true) on conflict do nothing;

-- ============ INVOICES ============
create table invoices (
    id uuid primary key default gen_random_uuid(),
    invoice_number bigint generated always as identity unique,  -- sequential, for FTA tax invoices
    visit_id uuid references visits(id),
    hospitalization_id uuid references hospitalizations(id),
    client_id uuid references clients(id) not null,
    subtotal numeric(10,2) not null default 0,
    vat_amount numeric(10,2) not null default 0,   -- 5% UAE VAT
    total numeric(10,2) not null default 0,
    status text not null default 'unpaid',  -- unpaid, partially_paid, paid, void
    payment_method text check (payment_method in ('cash', 'card', 'bank_transfer', 'payment_link')),
    paid_at timestamptz,
    amount_paid numeric(10,2) not null default 0,  -- kept in sync from invoice_payments, see lib/invoicing.js
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

-- A log of every individual payment received against an invoice — lets a
-- bill be paid in installments, possibly by different methods, without
-- losing the trail. invoices.amount_paid/status are derived from this
-- table (see lib/invoicing.js recomputeInvoicePayments).
create table invoice_payments (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid references invoices(id) on delete cascade not null,
    amount numeric(10,2) not null check (amount > 0),
    payment_method text not null check (payment_method in ('cash', 'card', 'bank_transfer', 'payment_link')),
    received_by uuid references staff(id) not null,
    paid_at timestamptz not null default now(),
    created_at timestamptz default now()
);

create index invoice_payments_invoice_id_idx on invoice_payments(invoice_id);

-- ============ ACCOUNTING: EXPENSES ============
-- The other half of a basic P&L/VAT picture, alongside invoices (revenue/
-- output VAT). Receipt photos reuse the existing `attachments` table
-- (entity_type = 'expense') rather than a dedicated image column — see
-- migrations/029_accounting.sql.
create table expenses (
    id uuid primary key default gen_random_uuid(),
    expense_date date not null default current_date,
    vendor_name text,
    description text,
    category text not null default 'other',  -- 'supplies', 'rent', 'utilities', 'salaries', 'equipment', 'marketing', 'professional_fees', 'other'
    amount numeric(10,2) not null,                 -- pre-VAT
    vat_amount numeric(10,2) not null default 0,   -- input VAT paid on this purchase (reclaimable)
    total numeric(10,2) not null,                  -- amount + vat_amount
    payment_method text check (payment_method in ('cash', 'card', 'bank_transfer', 'payment_link')),
    created_at timestamptz default now()
);
create index idx_expenses_date on expenses(expense_date);

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
-- Only one admitted case can occupy a cage at a time. Doesn't block a
-- discharged case from keeping its old cage_id for the record — this only
-- applies while status = 'admitted'.
create unique index idx_hospitalizations_cage_active on hospitalizations(cage_id)
    where status = 'admitted' and cage_id is not null;
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
    vaccine_protocols, vaccinations, intake_requests, expenses, staff_roster_entries;

-- ============ ROW LEVEL SECURITY ============
-- RLS is intentionally left disabled: the app has no staff auth yet and
-- talks to Supabase directly with the publishable key. Enable RLS and add
-- policies (e.g. scoped to authenticated staff) before this goes anywhere
-- near production data.
--
-- Newer Supabase projects auto-enable RLS by default on new tables, so
-- this is explicit rather than relying on Postgres's off-by-default.
alter table staff disable row level security;
alter table staff_roster_entries disable row level security;
alter table clients disable row level security;
alter table patients disable row level security;
alter table rooms disable row level security;
alter table appointments disable row level security;
alter table visits disable row level security;
alter table consult_notes disable row level security;
alter table goods_services disable row level security;
alter table invoices disable row level security;
alter table expenses disable row level security;
alter table invoice_line_items disable row level security;
alter table diagnostics disable row level security;
alter table treatment_items disable row level security;
alter table surgical_reports disable row level security;
alter table dental_reports disable row level security;
alter table hospitalizations disable row level security;
alter table cages disable row level security;
alter table hospitalization_notes disable row level security;
alter table attachments disable row level security;
alter table recordings disable row level security;
alter table clinic_settings disable row level security;
alter table vaccine_protocols disable row level security;
alter table vaccinations disable row level security;
alter table intake_requests disable row level security;
alter table catalog_subcategories disable row level security;
alter table consent_forms disable row level security;
alter table patient_alerts disable row level security;
alter table invoice_payments disable row level security;
