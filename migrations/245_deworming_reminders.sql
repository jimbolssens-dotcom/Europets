-- Migration 245: deworming reminders (Jim, 8 Nov)
--
-- A patient can be put on a deworming reminder every 3 or 6 months, from
-- the patient file or the consult. The daily reminder run sends a WhatsApp
-- (deworming_reminder template, email as fallback) 3 days before each due
-- date. The due date counts on from the last deworming: the newer of
-- deworm_last_date (set by staff) and the last invoice line for a dewormer
-- (last_deworming_dates below), so charging the tablet restarts the clock.
--
-- deworm_reminded_for: the due date the last reminder was for, so each due
-- date is only ever reminded once.
--
-- Adds columns and a read-only function. Safe to run more than once.

alter table patients add column if not exists deworm_interval_months smallint;
alter table patients add column if not exists deworm_last_date date;
alter table patients add column if not exists deworm_reminded_for date;
alter table patients add column if not exists deworm_reminder_sent_at timestamptz;

alter table patients drop constraint if exists patients_deworm_interval_check;
alter table patients add constraint patients_deworm_interval_check
  check (deworm_interval_months is null or deworm_interval_months in (3, 6));

create index if not exists patients_deworm_interval_idx
  on patients (deworm_interval_months) where deworm_interval_months is not null;

-- The last day each patient was charged for a dewormer (Dubai date of the
-- invoice), through its consults and its hospital stays.
create or replace function last_deworming_dates(p_ids uuid[])
returns table (patient_id uuid, last_date date)
language sql
stable
set search_path = public
as $$
  select pid, max((i.created_at at time zone 'Asia/Dubai')::date)
  from (
    select v.patient_id as pid, i.id as invoice_id
      from invoices i join visits v on v.id = i.visit_id
     where v.patient_id = any(p_ids)
    union
    select h.patient_id, i.id
      from invoices i join hospitalizations h on h.id = i.hospitalization_id
     where i.visit_id is null and h.patient_id = any(p_ids)
  ) x
  join invoices i on i.id = x.invoice_id
  join invoice_line_items l on l.invoice_id = i.id
  left join goods_services g on g.id = l.goods_service_id
  where coalesce(g.name, l.description, '') ~* '(deworm|vermis|milbemax|drontal|profender|panacur|broadline|advocate|nexgard spectra|simparica trio|credelio plus|stronghold plus|milpro|cestem|endogard)'
    and i.status <> 'void'
  group by pid
$$;

revoke all on function last_deworming_dates(uuid[]) from public, anon;
grant execute on function last_deworming_dates(uuid[]) to service_role, authenticated;
