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
    full_name text not null,
    phone text,
    email text,
    address text,
    created_at timestamptz default now()
);

-- ============ PATIENTS ============
create table patients (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade,
    name text not null,
    species text not null,           -- dog, cat, etc.
    breed text,
    date_of_birth date,
    sex text,                        -- 'male', 'female', 'unknown'
    current_weight_kg numeric(6,2),  -- updated at each visit; used for per-kg pricing
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

-- ============ VISITS ============
-- Created when an appointment is checked in (or walk-in)
create table visits (
    id uuid primary key default gen_random_uuid(),
    appointment_id uuid references appointments(id),
    patient_id uuid references patients(id) not null,
    client_id uuid references clients(id) not null,
    room_id uuid references rooms(id),
    attending_vet_id uuid references staff(id),
    status text not null default 'in_progress',  -- in_progress, complete
    started_at timestamptz default now(),
    ended_at timestamptz
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

-- ============ GOODS & SERVICES ============
create table goods_services (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    category text not null,          -- 'product', 'service', 'procedure', 'medication'
    pricing_type text not null default 'flat',  -- 'flat', 'per_kg', 'per_unit'
    base_price numeric(10,2) not null,
    unit text,                       -- e.g. 'mg', 'ml', 'kg' (used when pricing_type != flat)
    active boolean default true,
    created_at timestamptz default now()
);

-- ============ INVOICES ============
create table invoices (
    id uuid primary key default gen_random_uuid(),
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

-- ============ REALTIME ============
-- The app subscribes to postgres_changes on these tables (patient list,
-- appointment calendar, active visits board, live consult notes, invoice
-- line items) — they must be in the supabase_realtime publication for
-- those subscriptions to receive anything.
alter publication supabase_realtime add table
    clients, patients, appointments, visits, consult_notes, invoices, invoice_line_items;

-- ============ ROW LEVEL SECURITY ============
-- RLS is intentionally left disabled: the app has no staff auth yet and
-- talks to Supabase directly with the anon key. Enable RLS and add
-- policies (e.g. scoped to authenticated staff) before this goes anywhere
-- near production data.
