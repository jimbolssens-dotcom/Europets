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
    -- What this shift actually covers — the client booking form only
    -- offers a slot with a doctor flagged for the matching kind (see
    -- migration 050).
    can_consult boolean not null default true,
    can_surgery boolean not null default false,
    created_at timestamptz default now(),
    unique (staff_id, date, shift)
);
create index idx_staff_roster_entries_date on staff_roster_entries(date);
create index idx_staff_roster_entries_staff on staff_roster_entries(staff_id);

-- Shared by clients.client_number and patients.patient_number (see
-- migrations/068) — the clinic's old system pulled a new client's number
-- from the same running counter as patient numbers, so a client's first
-- patient always carries the same number as the client itself. See the
-- set_first_patient_number trigger below patients for the other half of
-- that rule.
create sequence clinic_number_seq;

-- ============ CLIENTS ============
create table clients (
    id uuid primary key default gen_random_uuid(),
    client_number bigint not null default nextval('clinic_number_seq') unique,  -- human-facing client number
    full_name text not null,
    phone text,               -- synced to whichever client_phones row is_whatsapp=true (see below)
    emirates_id text,        -- UAE Emirates ID number, typed or read off a scanned card
    trn text,                -- client's own VAT Tax Registration Number, if a registered business
    email text,
    address text,
    emirate text,             -- which of the 7 emirates they're based in (see lib/emirates.js);
                               -- distinct from emirates_id above
    legacy_outstanding_balance numeric(10,2),  -- carried over from the old clinic software at import,
                                                -- reference only; not linked to any invoice here (migration 069)
    created_at timestamptz default now()
);

-- A client's phone numbers — as many as they like, each with a mandatory
-- label (a preset like "Husband"/"Maid" or free-typed custom text), and
-- at most one flagged as their preferred WhatsApp number (see the partial
-- unique index). clients.phone is kept in sync with that one number, since
-- most of the app (search, WhatsApp draft links, PDFs) just reads it
-- directly rather than joining this table.
create table client_phones (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade not null,
    phone text not null,
    label text not null,
    is_whatsapp boolean not null default false,
    created_at timestamptz default now()
);

create unique index client_phones_one_whatsapp_per_client
    on client_phones (client_id) where (is_whatsapp);
create index client_phones_client_id_idx on client_phones (client_id);
create index client_phones_phone_idx on client_phones (phone);

-- ============ PATIENTS ============
create table patients (
    id uuid primary key default gen_random_uuid(),
    patient_number bigint not null default nextval('clinic_number_seq') unique,  -- human-facing patient number
    client_id uuid references clients(id) on delete cascade,
    name text not null,
    species text not null,           -- dog, cat, etc.
    breed text,
    color text,
    date_of_birth date,
    sex text,                        -- 'male', 'female', 'male_castrated', 'female_spayed', 'unknown' —
                                      -- required on the intake forms (migration 059) but not enforced not
                                      -- null here, since older rows predate that requirement
    current_weight_kg numeric(6,2),  -- updated at each visit; used for per-kg pricing
    microchip_number text unique,    -- ISO microchip number, if chipped
    microchip_implanted_at date,
    deceased boolean not null default false,
    notes text,
    created_at timestamptz default now()
);

-- A client's first-ever patient reuses the client's own number rather
-- than drawing a new one from clinic_number_seq (see the comment above
-- clients). A trigger, not application code, so the rule holds no
-- matter which code path creates the patient row.
create or replace function set_first_patient_number()
returns trigger
language plpgsql
as $$
begin
  if new.client_id is not null and not exists (
    select 1 from patients where client_id = new.client_id
  ) then
    select client_number into new.patient_number from clients where id = new.client_id;
  end if;
  return new;
end;
$$;

create trigger patients_first_number
  before insert on patients
  for each row execute function set_first_patient_number();

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
    -- Came from a client's own booking request (see intake_requests
    -- below) rather than staff booking it directly here (migration 050).
    client_requested boolean not null default false,
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
    treatment_notes text,
    ai_summary text                  -- client-facing consult report, generated on
                                      -- completion (migration 072) — see
                                      -- lib/anthropicClient.js#generateConsultReport
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

-- ============ POLICIES & PROCEDURES ============
-- Staff-only reference manual: categories (Client Reception, Vaccination
-- Protocols, ...) each holding one or more written policies. Meant to be
-- built up over time by the clinic and used for onboarding new staff.
create table policy_categories (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    sort_order int not null default 0,
    created_at timestamptz default now()
);

create table policies (
    id uuid primary key default gen_random_uuid(),
    category_id uuid references policy_categories(id) on delete cascade not null,
    title text not null,
    content text not null default '',
    sort_order int not null default 0,
    updated_at timestamptz not null default now(),
    created_at timestamptz default now()
);

-- Seeded with a starting set of categories and draft policies covering the
-- areas most clinics need on day one — a reasonable starting structure,
-- not finished, vetted procedures. Anything written as "[confirm ...]" or
-- bracketed is a placeholder for the clinic's own actual standard, and
-- clinical content (vaccination/surgical protocols) should be reviewed by
-- the clinic's own vets rather than treated as medical guidance from this
-- seed data.
insert into policy_categories (name, sort_order) values
    ('Our Culture: Kindness First', 0),
    ('Client Reception & Intake', 1),
    ('Client Communication', 2),
    ('Vaccination Protocols', 3),
    ('Surgical Protocols', 4),
    ('Ordering & Inventory', 5),
    ('Payment & Billing', 6),
    ('General Clinic Standards', 7);

-- Pinned first (sort_order 0 on its category) on purpose: kindness/warmth/
-- compassion is the clinic's #1 standard, not a nice-to-have alongside the
-- procedural policies below — every other policy in this manual sits on
-- top of this one.
insert into policies (category_id, title, sort_order, content)
select id, 'Kindness, Warmth & Compassion — Our #1 Standard', 1, $policy$This comes before every other policy in this manual on purpose — it matters more than any procedure in it. A client's lasting impression of this clinic is not the treatment plan; it's whether they felt welcomed, heard, and genuinely cared for by a team that was glad to see them and their pet.

Standard:
- Smile. Every client, every patient, every time — even on your hardest, busiest day. It's the first thing anyone notices, and it sets the tone for everything that follows.
- Be present. Put down what you're doing, make eye contact, and give the person in front of you your full attention, even for thirty seconds.
- Assume the best. A frustrated or anxious client is almost always scared for their pet, not being difficult. Meet that with patience, not defensiveness.
- Show it, don't just feel it. Crouch down to greet the dog. Speak gently to a frightened cat. Narrate what you're doing to a worried owner. Compassion only counts if the client can see it.
- Never make someone feel like a burden — not for calling with "just a question," not for needing extra reassurance, not for walking in without an appointment.

This is not a soft skill layered on top of the job. For this clinic, it is the job. Every other policy in this manual describes how we do things; this one describes who we are while we do them.$policy$
from policy_categories where name = 'Our Culture: Kindness First';

insert into policies (category_id, title, sort_order, content)
select id, 'New Client & Patient Registration', 1, $policy$Purpose: Ensure every new client and patient is registered consistently and nothing falls through the cracks.

Steps:
1. Greet the client and their pet warmly, with a genuine smile — first impressions start here. Ask if they are new to the clinic. Check for an existing record first (name, phone, Emirates ID) before creating a new one — use the duplicate-match warning in Add Client if it appears.
2. Collect the client's full name, phone number (mark their WhatsApp number), email, and address.
3. Ask if they were referred by another client or found the clinic online, and note it.
4. Register each pet: name, species, breed, sex, date of birth (or estimated age), and colour. Scan the client's Emirates ID if available to speed up data entry.
5. Ask about microchip status. If already chipped, record the microchip number.
6. Explain the clinic's WhatsApp reminder system and confirm the client is happy to receive reminders on the number provided.
7. If this is a same-day appointment, proceed to booking/check-in immediately after registration.

Notes: A client should never be created twice under a different number — always search first. If in doubt, ask a senior staff member before creating a new client record for someone who may already exist.$policy$
from policy_categories where name = 'Client Reception & Intake';

insert into policies (category_id, title, sort_order, content)
select id, 'Appointment Scheduling & Check-In', 2, $policy$Purpose: Keep the schedule predictable for vets and reduce client wait times.

Steps:
1. Confirm the reason for the visit before booking — this determines whether it needs a consult slot or a longer surgery slot.
2. Check room/vet availability on the schedule before confirming a time with the client.
3. Always confirm the patient's name and species when booking, not just the client's name.
4. On arrival, check the client in against their booked appointment. If they're a walk-in, register/confirm the patient's details first, then check in as unscheduled.
5. Let the client know the estimated wait time if the schedule is running behind.

Notes: [Clinic to confirm] standard consult length and how far in advance appointments can be booked online via the client intake link. Emergencies and walk-ins are never turned away, even when the schedule looks full — see "Emergencies & Walk-Ins — Nobody Is Ever Turned Away" for exactly how to handle them.$policy$
from policy_categories where name = 'Client Reception & Intake';

insert into policies (category_id, title, sort_order, content)
select id, 'Emergencies & Walk-Ins — Nobody Is Ever Turned Away', 3, $policy$Purpose: When someone believes their pet is having an emergency, or arrives without an appointment, our first job is to make them feel heard and cared for — not to judge whether their emergency is "real enough" at the front desk. Nobody is ever sent away.

Standard:
1. If a client says it's an emergency, treat it as one until a vet says otherwise. Don't question or debate it at reception — get them seen.
2. If the schedule looks fully booked, an emergency is fit in anyway. Speak to the vet/duty doctor immediately rather than telling the client to come back later or go elsewhere.
3. A walk-in without an appointment is never refused, regardless of how full the schedule looks. They are worked in as soon as possible, even if that means a short wait.
4. Explain, kindly and clearly, that being seen without a booked appointment — emergency or walk-in — carries a [clinic to confirm amount] non-appointment/emergency surcharge on top of the usual consult fee. Frame it as "there's a small surcharge for fitting you in outside our normal schedule," never as a penalty.
5. If a client is waiting and anxious, check in with them — a short "we haven't forgotten you, the vet will be right with you" goes a long way.

Notes: This policy overrides normal scheduling — "we're fully booked" is never, on its own, a reason to turn someone away. If truly no vet is available at all (not just no open slot), see [clinic to define] for how to handle referring them elsewhere — but that should be a rare exception, not a default response.$policy$
from policy_categories where name = 'Client Reception & Intake';

insert into policies (category_id, title, sort_order, content)
select id, 'Communicating Diagnoses, Treatment Plans & Costs', 1, $policy$Purpose: Make sure clients always understand what's wrong with their pet, what's being proposed, and what it will cost — before it happens, not after.

Steps:
1. The vet explains findings and diagnosis to the client directly wherever possible, in plain language, before any treatment starts.
2. Walk through the treatment plan item by item, including medications, diagnostics, and any procedures — the client should never be surprised by something on the invoice they weren't told about first.
3. Give a cost estimate before starting anything beyond a standard consult. For anything significant (surgery, hospitalization, extensive diagnostics), get informed consent using the appropriate consent form.
4. If a treatment plan changes mid-visit (e.g. an X-ray reveals something new), pause and get the client's agreement before continuing.
5. Document the conversation in the consult notes — what was discussed, not just what was done.

Notes: If a client can't be reached (e.g. a boarding/hospitalized pet needing an urgent decision), the clinic may proceed with whatever care is in the pet's best interest per the signed consent form, and inform the client as soon as possible afterward.$policy$
from policy_categories where name = 'Client Communication';

insert into policies (category_id, title, sort_order, content)
select id, 'Handling Complaints & Difficult Conversations', 2, $policy$Purpose: Handle concerns calmly and consistently so small issues don't become lost clients or reputational damage.

Steps:
1. Listen first — let the client fully explain the issue before responding.
2. Apologize for the experience (not necessarily an admission of fault) and thank them for raising it.
3. If it's something reception can resolve (e.g. a billing question, a scheduling mix-up), resolve it on the spot.
4. If it involves clinical judgment or a serious complaint, involve the treating vet or clinic manager before responding further.
5. Document the complaint and how it was resolved.

Notes: Never argue with a client in front of other clients. Move the conversation to a private area if it's getting heated.$policy$
from policy_categories where name = 'Client Communication';

insert into policies (category_id, title, sort_order, content)
select id, 'Core Vaccination Schedule Overview', 1, $policy$Purpose: Give every patient a consistent, on-schedule vaccination plan, and make sure clients understand why it matters.

Overview:
- The clinic's standard protocols are maintained in Settings → Vaccine Protocols, tagged by species (currently: PCH and Rabies for cats; DHPPi + Lepto, Rabies, and optional Kennel Cough for dogs).
- A puppy/kitten's first vaccines are given as a Primary Booster series — the core vaccine is due again at 1 month, and rabies is added at that same 1-month follow-up if it wasn't given on day one.
- After the primary series, vaccines move to their normal annual (or protocol-defined) interval.
- Always check a patient's vaccination history and due dates on their profile before vaccinating — never duplicate a still-valid vaccine.

Steps:
1. Confirm the patient is healthy (no fever, not currently unwell) before vaccinating.
2. Record the vaccine given and set the next-due date using the Add Vaccination form.
3. Advise the client of possible mild side effects (soreness, lethargy for a day) and when to bring the pet back if something seems wrong.
4. Add any due/overdue vaccines to the clinic-wide Vaccinations reminder list if not already flagged.

Notes: [Vet to confirm] whether any additional non-core vaccines (e.g. Leptospirosis for high-risk dogs, FeLV for outdoor cats) should be offered as optional add-ons, and under what circumstances.$policy$
from policy_categories where name = 'Vaccination Protocols';

insert into policies (category_id, title, sort_order, content)
select id, 'Vaccine Handling, Storage & Cold Chain', 2, $policy$Purpose: Protect vaccine efficacy — a vaccine stored or handled incorrectly may not protect the patient at all, without anyone knowing.

Steps:
1. Store all vaccines in the designated clinic fridge at [2-8°C — confirm range], never in a door shelf where temperature fluctuates most.
2. Check and log fridge temperature [daily — confirm frequency] and flag any reading out of range immediately.
3. Never leave a vaccine vial out of the fridge longer than necessary to draw up the dose.
4. Check expiry dates when receiving new stock and again before each use — never administer an expired vaccine.
5. Dispose of used vials and sharps in the designated sharps bin immediately after use.

Notes: If a fridge failure or prolonged power outage is suspected, do not use any vaccine from that fridge until a vet confirms it's still viable, or it's discarded.$policy$
from policy_categories where name = 'Vaccination Protocols';

insert into policies (category_id, title, sort_order, content)
select id, 'Pre-Surgical Assessment & Consent', 1, $policy$Purpose: Make sure every surgical patient is properly assessed and the client has given informed consent before anything is scheduled or started.

Steps:
1. The vet examines the patient and reviews history/bloodwork (if indicated by age/risk) before confirming the patient is fit for anesthesia.
2. Explain the procedure, expected recovery, and risks to the client in plain language.
3. Sign the appropriate consent form before the day of surgery where possible: Standard Neutering for routine spay/neuter, or Complex/High-Risk for anything with elevated anesthetic or surgical risk.
4. Confirm the client has followed pre-op fasting instructions on the day of surgery.
5. Confirm payment/estimate has been discussed before proceeding (see Payment & Billing).

Notes: A patient assessed as higher risk (age, breed, pre-existing condition) should always go through the Complex/High-Risk consent, even for an otherwise routine procedure — when in doubt, use the more thorough form.$policy$
from policy_categories where name = 'Surgical Protocols';

insert into policies (category_id, title, sort_order, content)
select id, 'Post-Operative Care & Discharge', 2, $policy$Purpose: Ensure a smooth, safe recovery and that the client knows exactly what to do (and watch for) once the pet goes home.

Steps:
1. Monitor the patient in recovery until [vet to confirm minimum monitoring time] and stable before considering discharge.
2. Complete the surgical report, including home-care instructions, before the client picks up the pet.
3. Walk the client through the home-care instructions verbally as well as handing over the written report — don't just hand over a page and assume it will be read.
4. Confirm the client knows the follow-up/suture-removal date if applicable, and book it before they leave if possible.
5. Give clear instructions on what constitutes an emergency (e.g. wound opening, collapse, not eating within a set number of hours) and who to call.

Notes: Any patient hospitalized post-op should follow the standard Hospitalization worksheet process, not a separate ad hoc process.$policy$
from policy_categories where name = 'Surgical Protocols';

insert into policies (category_id, title, sort_order, content)
select id, 'Stock Ordering & Reorder Levels', 1, $policy$Purpose: Avoid running out of medications, consumables, or vaccines mid-treatment, without overstocking capital into shelf life that expires.

Steps:
1. [Staff member responsible] checks stock levels against the reorder point for each catalog item on a [weekly — confirm cadence] basis.
2. Place orders with the clinic's approved suppliers; unusual or one-off items need manager/vet approval before ordering.
3. On delivery, check the order against the invoice/packing slip for shortages or damage before shelving.
4. Rotate stock so older expiry dates are used first (FEFO — first-expired, first-out).
5. Flag anything nearing expiry with no expected use so it can be used, discounted, or safely disposed of before it's wasted.

Notes: [Clinic to define] minimum stock thresholds per category (medications, consumables, food) and who has ordering authority.$policy$
from policy_categories where name = 'Ordering & Inventory';

insert into policies (category_id, title, sort_order, content)
select id, 'Controlled Drugs & Restricted Items', 2, $policy$Purpose: Meet legal and safety obligations around controlled substances and prevent loss, theft, or misuse.

Steps:
1. Controlled drugs are stored in [a locked cabinet/safe — confirm] accessible only to [confirm who].
2. Every use is logged: date, patient, quantity, and administering vet.
3. Stock is reconciled against the log [monthly — confirm cadence]; any discrepancy is investigated and reported to a manager/vet immediately.
4. Ordering of controlled substances requires vet sign-off, not general reception ordering.

Notes: This section should be reviewed against actual local regulatory requirements for veterinary controlled substances — treat the above as a starting structure, not a compliance guarantee.$policy$
from policy_categories where name = 'Ordering & Inventory';

insert into policies (category_id, title, sort_order, content)
select id, 'Payment Collection at Checkout', 1, $policy$Purpose: Make sure every visit is paid for consistently, with no confusion about what's owed or accepted payment methods.

Steps:
1. Generate the invoice from the consult/hospitalization/appointment before the client leaves — never let a client leave "to pay next time" without manager approval.
2. Walk the client through the invoice line by line if it includes anything beyond what was originally discussed.
3. Accepted payment methods: [confirm which apply — cash, card, bank transfer, payment link].
4. All invoices are standard-rated at 5% UAE VAT unless the item is genuinely exempt — the invoicing system handles this automatically; don't override it without checking with a manager.
5. Provide the Tax Invoice PDF to the client (print or share digitally) as their official receipt.

Notes: A VAT-registered client can provide their own TRN to appear on the invoice — ask if they need this for their own accounting.$policy$
from policy_categories where name = 'Payment & Billing';

insert into policies (category_id, title, sort_order, content)
select id, 'Outstanding Balances & Payment Plans', 2, $policy$Purpose: Handle unpaid balances fairly and consistently, without ad hoc decisions per client.

Steps:
1. Any invoice left unpaid or partially paid is flagged and followed up within [confirm timeframe].
2. A payment plan or delayed payment requires manager/owner approval — reception should not agree to this independently.
3. Record any agreed plan clearly against the client's invoice so anyone following up knows the terms.
4. Be respectful and non-confrontational when following up — most overdue balances are oversight, not refusal to pay.

Notes: [Clinic to define] at what point an overdue balance is escalated beyond a friendly reminder.$policy$
from policy_categories where name = 'Payment & Billing';

insert into policies (category_id, title, sort_order, content)
select id, 'Professional Conduct & Presentation', 1, $policy$Purpose: Present a consistent, professional, trustworthy face to every client, every time.

Standards:
- Above everything else on this list: smile, be warm, and make every client and patient feel genuinely cared for. See "Our Culture: Kindness First" — it matters more than anything else here.
- Uniform/dress code: [clinic to define].
- Greet every client warmly within a few seconds of them entering, even if you're mid-task with someone else — acknowledge them.
- Speak about patients and clients respectfully at all times, including when they're not present.
- Personal phone use is kept to breaks, not the treatment or reception floor.
- Confidentiality: client and patient information is never discussed outside the clinic or with other clients.

Notes: These are starting expectations — adjust to match how the clinic actually wants to present itself.$policy$
from policy_categories where name = 'General Clinic Standards';

insert into policies (category_id, title, sort_order, content)
select id, 'Hygiene & Infection Control', 2, $policy$Purpose: Protect patients, staff, and clients from cross-contamination and disease spread within the clinic.

Steps:
1. Wash or sanitize hands between every patient — no exceptions, even for a "quick look."
2. Disinfect the consult table and any equipment used after every patient, before the next one comes in.
3. Isolate any patient with a suspected contagious condition (e.g. parvo, kennel cough, ringworm) using the Isolation cages/area rather than the general ward.
4. Use PPE (gloves, gown) appropriately for isolation cases and any procedure with exposure risk.
5. Clean and disinfect all surgical instruments per the clinic's sterilization procedure.

Notes: [Clinic to confirm] cleaning schedule and products used for daily vs. deep cleaning.$policy$
from policy_categories where name = 'General Clinic Standards';

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
    emirate text,             -- which of the 7 emirates they're based in (see lib/emirates.js)
    patients jsonb not null default '[]',  -- [{name, species, breed, date_of_birth, sex, microchip_number}], filled in by the client
    notes text,
    submitted_at timestamptz,
    reviewed_at timestamptz,
    -- Set once approved for a brand-new client — OR set by staff up front,
    -- before the link is even sent, to scope this link to one already-
    -- registered client: the public form then skips the owner-detail
    -- fields and offers a picker of just that client's own pets instead
    -- of collecting them again (see migration 050 and
    -- app/(admin)/clients/[id]/page.jsx's "Send Booking Link").
    client_id uuid references clients(id),
    -- An already-registered pet the client picked (existing-client link),
    -- as an alternative to typing a new one into `patients` above.
    selected_patient_id uuid references patients(id),
    -- The appointment slot requested alongside this intake/booking, if
    -- any — null means this link was just for registering, not booking.
    -- 'consult' is a fixed 15 minutes; 'spay'/'castration' durations are
    -- computed from the pet's species/weight (see lib/appointmentBooking.js);
    -- 'dental_small'/'dental_big' are fixed 30/45 min. All four surgery-
    -- ish types share the roster's can_surgery flag — no separate dental
    -- flag (migration 051) — and are only ever offered in the morning
    -- window regardless of what shift that flag is set on (surgeries
    -- aren't done in the afternoon). 'other_surgery' (migration 053) is
    -- anything non-standard: the client describes it and suggests a day
    -- instead of picking an exact slot (requested_vet_id/start_time/
    -- duration_minutes stay null until staff sets them on approval).
    appointment_type text check (appointment_type in ('consult', 'spay', 'castration', 'dental_small', 'dental_big', 'other_surgery')),
    requested_vet_id uuid references staff(id),
    requested_start_time timestamptz,
    requested_duration_minutes int,
    -- 'other_surgery' only: the client's own description of what's needed,
    -- and the day they'd prefer (not an exact time — staff schedule the
    -- actual slot once they know how long it'll take).
    custom_surgery_reason text,
    preferred_date date,
    -- Set once approved, if an appointment was requested — the real
    -- appointments row (status 'booked'; approving *is* the confirmation,
    -- so there's no separate pending status on appointments itself).
    appointment_id uuid references appointments(id),
    created_at timestamptz default now()
);

-- ============ REVIEW REQUESTS ============
-- Review/testimonial requests, sent to clients via WhatsApp and filled in
-- on the public website (no login) — moderated by staff before they ever
-- appear on the site. Mirrors the intake_requests request/submission
-- pattern above (migration 057).
create table review_requests (
    id uuid primary key default gen_random_uuid(),
    status text not null default 'pending',  -- pending (link sent, not filled in yet),
                                              -- submitted (filled in, awaiting staff review),
                                              -- approved (shown on the public site), rejected
    client_id uuid references clients(id),
    sent_to_phone text,  -- the number staff sent the link to
    rating smallint check (rating between 1 and 5),
    comment text,
    display_name text,  -- how the client wants to be shown publicly, e.g. "Sarah K." — defaults to their first name + last initial if left blank
    submitted_at timestamptz,
    reviewed_at timestamptz,
    created_at timestamptz default now()
);

create index idx_review_requests_status on review_requests(status);

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

-- ============ ULTRASOUND REPORTS ============
-- Same shape as surgical_reports/dental_reports above, but triggered from
-- a specific Ultrasound entry in diagnostics rather than a standalone
-- section (migration 072) — diagnostic_id links it back to exactly which
-- scan the dictation and AI-elaborated report are for.
create table ultrasound_reports (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid references visits(id) on delete cascade not null,
    diagnostic_id uuid references diagnostics(id) on delete set null,
    performed_by uuid references staff(id),
    findings text,
    notes text,
    ai_summary text,          -- populated by AI elaboration of the dictated findings
    performed_at timestamptz default now(),
    created_at timestamptz default now()
);

-- ============ X-RAY REPORTS ============
-- Same as ultrasound_reports above, triggered from a specific X-ray entry
-- in diagnostics (migration 073).
create table xray_reports (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid references visits(id) on delete cascade not null,
    diagnostic_id uuid references diagnostics(id) on delete set null,
    performed_by uuid references staff(id),
    findings text,
    notes text,
    ai_summary text,          -- populated by AI elaboration of the dictated findings
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
    update_request_message text,      -- optional short note the client typed alongside that request
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
    client_summary text,             -- editable prose shown to owners for a check-in entry;
                                      -- generated once at creation, staff-editable afterward
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

-- A link sent to a client (via WhatsApp) to review and digitally sign a
-- consent form themselves, as an alternative to signing in person on a
-- staff device — see migration 061. On submission this creates the real,
-- authoritative row above (consent_form_id), the same way an in-person
-- signature does; nothing about consent_forms itself changes.
create table consent_form_requests (
    id uuid primary key default gen_random_uuid(),
    status text not null default 'pending',  -- pending (link sent, not signed yet), submitted
    visit_id uuid references visits(id),
    hospitalization_id uuid references hospitalizations(id),
    form_type text not null check (
        form_type in ('surgery_standard_neuter', 'surgery_complex', 'hospitalization', 'dental')
    ),
    sent_to_phone text,
    consent_form_id uuid references consent_forms(id),
    created_at timestamptz default now(),
    submitted_at timestamptz
);

create index idx_consent_form_requests_visit on consent_form_requests(visit_id);
create index idx_consent_form_requests_hospitalization on consent_form_requests(hospitalization_id);

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
    created_at timestamptz default now(),
    compressed_at timestamptz  -- set once its image has been shrunk down after its case closed (see lib/attachmentCompression.js); null means still full-size/untouched
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
    file_path text,                  -- path within the consult-files bucket; null once the
                                      -- audio is deleted after transcription (migration 067)
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
    -- Claim marker so only one concurrent resolveRecording run actually
    -- does the (non-idempotent) work of inserting treatment items and
    -- appending extracted text — see lib/recordingProcessing.js. Without
    -- this, AssemblyAI redelivering a slow webhook, or a "Check now" click
    -- landing while a run is still in flight, could both pass the
    -- still-processing check and both fully process the same recording.
    claimed_at timestamptz,
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
    -- The two windows a client can request a slot in on the self-booking
    -- portal form (see lib/appointmentBooking.js) — editable on the
    -- Settings page since the clinic's actual hours change (migration 052).
    booking_morning_start time not null default '09:00',
    booking_morning_end time not null default '13:00',
    booking_afternoon_start time not null default '16:30',
    booking_afternoon_end time not null default '19:00',
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
    line_total numeric(10,2) not null,           -- pre-VAT
    -- Same instructions already folded into `description`'s free text, kept
    -- separately (and editable) so the dispensing label feature can print
    -- them without re-parsing that string. administration_method mirrors
    -- the originating treatment_item's, so the label form can default to
    -- selecting only medications actually dispensed to go home (see
    -- migration 049).
    instructions text,
    administration_method text check (administration_method in ('dispense', 'sc', 'im')),
    -- A plain (no transcription/AI) recorded voice note, as a fallback for
    -- when the treatment item's instructions weren't dictated or typed
    -- during the consult — path within the consult-files bucket, or null
    -- (see migration 060).
    voice_note_path text
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
    -- Null for an online Nomod payment recorded automatically by its
    -- webhook (see nomod_payment_links below, migration 058) — every
    -- other payment method is taken by a staff member in person and must
    -- still name one.
    received_by uuid references staff(id),
    paid_at timestamptz not null default now(),
    created_at timestamptz default now()
);

create index invoice_payments_invoice_id_idx on invoice_payments(invoice_id);

-- ============ NOMOD PAYMENT LINKS ============
-- Created lazily when a client opens their own "Settle Your Bill" page on
-- the website (website/app/settle-bill/[id]) — never precomputed by staff —
-- so it's always for the invoice's current real balance. Tracked here so a
-- repeat visit reuses a still-pending link, and so the webhook has
-- something to match a completed payment back to (migration 058).
--
-- A link targets exactly one of invoice_id (settle one invoice) or
-- client_id (a "campaign" link for a client's whole outstanding balance,
-- website/app/settle-bill/owner/[clientId] — see migration 066). Paying a
-- client_id link allocates the amount across that client's outstanding
-- invoices oldest-first (lib/nomodPayments#recordNomodOwnerPayment).
create table nomod_payment_links (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid references invoices(id),
    client_id uuid references clients(id),
    nomod_link_id text,  -- Nomod's own id for this link — what the webhook matches on
    url text not null,
    amount numeric(10,2) not null,
    status text not null default 'pending',  -- pending, paid, cancelled
    created_at timestamptz default now(),
    paid_at timestamptz,
    constraint nomod_payment_links_target_check check ((invoice_id is not null) <> (client_id is not null))
);

create index idx_nomod_payment_links_invoice_id on nomod_payment_links(invoice_id);
create index idx_nomod_payment_links_client_id on nomod_payment_links(client_id);
create unique index idx_nomod_payment_links_nomod_link_id on nomod_payment_links(nomod_link_id) where nomod_link_id is not null;

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
create index idx_policies_category on policies(category_id);

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
    diagnostics, treatment_items, surgical_reports, dental_reports, ultrasound_reports, xray_reports,
    hospitalizations, hospitalization_notes, attachments, recordings, clinic_settings,
    vaccine_protocols, vaccinations, intake_requests, expenses, staff_roster_entries, review_requests,
    nomod_payment_links, policy_categories, policies;

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
alter table client_phones disable row level security;
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
alter table ultrasound_reports disable row level security;
alter table xray_reports disable row level security;
alter table hospitalizations disable row level security;
alter table cages disable row level security;
alter table hospitalization_notes disable row level security;
alter table attachments disable row level security;
alter table recordings disable row level security;
alter table clinic_settings disable row level security;
alter table vaccine_protocols disable row level security;
alter table vaccinations disable row level security;
alter table intake_requests disable row level security;
alter table review_requests disable row level security;
alter table nomod_payment_links disable row level security;
alter table catalog_subcategories disable row level security;
alter table consent_forms disable row level security;
alter table consent_form_requests disable row level security;
alter table patient_alerts disable row level security;
alter table invoice_payments disable row level security;
alter table policy_categories disable row level security;
alter table policies disable row level security;
