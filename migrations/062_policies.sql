-- Migration 062: Policies & Procedures — a staff-only reference manual,
-- organized into categories (Client Reception, Vaccination Protocols, ...)
-- each holding one or more written policies. Meant to be built up over
-- time by the clinic and used for onboarding new staff.
--
-- Seeded with a starting set of categories and draft policies covering the
-- areas most clinics need on day one. These are a reasonable starting
-- structure, not finished, vetted procedures — anything written as
-- "[confirm ...]" or bracketed is a placeholder the clinic should fill in
-- with its own actual standard before relying on it, and clinical content
-- (vaccination/surgical protocols) should be reviewed by the clinic's own
-- vets, not treated as medical guidance from this migration.

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
create index idx_policies_category on policies(category_id);

alter table policy_categories disable row level security;
alter table policies disable row level security;

alter publication supabase_realtime add table policy_categories, policies;

-- ============ SEED CATEGORIES ============
insert into policy_categories (name, sort_order) values
    ('Client Reception & Intake', 1),
    ('Client Communication', 2),
    ('Vaccination Protocols', 3),
    ('Surgical Protocols', 4),
    ('Ordering & Inventory', 5),
    ('Payment & Billing', 6),
    ('General Clinic Standards', 7);

-- ============ SEED POLICIES ============

insert into policies (category_id, title, sort_order, content)
select id, 'New Client & Patient Registration', 1, $policy$Purpose: Ensure every new client and patient is registered consistently and nothing falls through the cracks.

Steps:
1. Greet the client and ask if they are new to the clinic. Check for an existing record first (name, phone, Emirates ID) before creating a new one — use the duplicate-match warning in Add Client if it appears.
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

Notes: [Clinic to confirm] standard consult length and how far in advance appointments can be booked online via the client intake link.$policy$
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
