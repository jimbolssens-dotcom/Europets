-- Migration 146: post-discharge WhatsApp follow-ups
--
-- One row per discharged surgical/dental stay, created automatically the
-- moment that hospitalization discharges (see
-- lib/hospitalizationDischarge.js) — due_at is when it becomes eligible to
-- actually send, giving the patient time to actually be home before
-- "how's recovery going?" makes sense.
--
-- Deliberately review-first, not auto-send: status starts 'scheduled',
-- and once due_at passes, GET /api/discharge-followups re-checks eligibility
-- (not deceased, not rehomed, not readmitted) and either marks it
-- 'skipped' (with why, so staff can see it was handled, not lost) or
-- drafts a message and marks it 'ready_for_review' for a staff member to
-- edit and send from app/(admin)/follow-ups. DISCHARGE_FOLLOWUP_AUTOSEND
-- (see lib/dischargeFollowups.js) is the one switch to flip later, once
-- this is trusted enough to send itself straight past review — the
-- eligibility check and the actual send are the same code either way,
-- only whether a human clicks "Send" first changes.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists discharge_followups (
    id uuid primary key default gen_random_uuid(),
    hospitalization_id uuid references hospitalizations(id) on delete cascade not null,
    patient_id uuid references patients(id) not null,
    client_id uuid references clients(id) not null,
    procedure_name text,
    vet_id uuid references staff(id),
    postop_instructions text,
    due_at timestamptz not null,
    status text not null default 'scheduled' check (status in ('scheduled', 'ready_for_review', 'sent', 'skipped')),
    skip_reason text,
    message_draft text,
    sent_at timestamptz,
    sent_by uuid references staff(id),
    created_at timestamptz not null default now(),
    unique (hospitalization_id)
);

create index if not exists idx_discharge_followups_status_due on discharge_followups(status, due_at);
create index if not exists idx_discharge_followups_patient on discharge_followups(patient_id);

alter table discharge_followups disable row level security;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'discharge_followups'
  ) then
    alter publication supabase_realtime add table discharge_followups;
  end if;
end $$;
