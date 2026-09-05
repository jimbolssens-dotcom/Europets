-- Migration 050: client self-service appointment booking
--
-- Lets a client request a 15-min consult or a standard spay/castration
-- slot through the same link-based, no-login portal used for intake —
-- either as an added step on a brand-new-client intake link, or on a link
-- pre-tied to an existing client's own record (so the public form can
-- safely offer just their own pets, never anyone else's). Staff approve
-- or reject the request; approving a request that includes an appointment
-- creates the real appointments row directly ('booked' — the approval
-- itself is the confirmation), so no new appointment status is needed.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

-- A roster entry no longer just means "on shift" — now it also says what
-- kind of booking that shift covers, so the client booking form only
-- offers a consult slot with a doctor flagged for consults, and a
-- spay/castration slot only with one flagged for surgery.
alter table staff_roster_entries add column if not exists can_consult boolean not null default true;
alter table staff_roster_entries add column if not exists can_surgery boolean not null default false;

-- Flags an appointment as having come from a client's own booking
-- request (vs. staff booking it directly on the Appointments page) —
-- lets the UI badge/filter these distinctly if needed later.
alter table appointments add column if not exists client_requested boolean not null default false;

-- The appointment (if any) a client requested as part of this intake
-- link, plus which existing pet it's for when this link belongs to an
-- already-registered client (see intake_requests.client_id, which staff
-- can now set *before* the client fills anything in, to scope the public
-- form to that one client's own pets instead of collecting owner details
-- again).
alter table intake_requests add column if not exists selected_patient_id uuid references patients(id);
alter table intake_requests add column if not exists appointment_type text
    check (appointment_type in ('consult', 'spay', 'castration'));
alter table intake_requests add column if not exists requested_vet_id uuid references staff(id);
alter table intake_requests add column if not exists requested_start_time timestamptz;
alter table intake_requests add column if not exists requested_duration_minutes int;
alter table intake_requests add column if not exists appointment_id uuid references appointments(id);
