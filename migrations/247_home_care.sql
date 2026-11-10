-- Migration 247: home care (Jim, 10 Nov)
--
-- home_care_plans: the short "what to do at home" list staff save on a
-- consult, a day procedure or a hospital stay (one per record). items is a
-- small list, each one of:
--   { key, kind: 'med',   name, dose, times_per_day (1-4), days }
--   { key, kind: 'task',  text, icon, days }   ticked once a day at home
--   { key, kind: 'keep',  text, icon, days }   keep doing, no tick
--   { key, kind: 'watch', text }               message us if
-- Shown on the pet in the client app only (no WhatsApp, no print).
--
-- home_care_logs: what an owner logs from the client app: a ticked dose or
-- task of a plan (kind 'dose' / 'task' with plan_id, item_key, for_date,
-- slot), or something they did themselves: medication, deworming,
-- flea/tick treatment, supplement, weight, temperature, eating, a note.
-- Staff see them on the patient file. Nothing is sent to the clinic.
--
-- A deworming logged by the owner counts as the pet's last deworming (the
-- reminder from migrations 245/246) and switches the 6-month reminder on.
--
-- Both tables are read and written only through the app's server routes
-- (service role); no browser access. Safe to run more than once.

create table if not exists home_care_plans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  visit_id uuid references visits(id) on delete cascade,
  hospitalization_id uuid references hospitalizations(id) on delete cascade,
  starts_on date not null,
  items jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists home_care_plans_visit_uidx on home_care_plans (visit_id) where visit_id is not null;
create unique index if not exists home_care_plans_hosp_uidx on home_care_plans (hospitalization_id) where hospitalization_id is not null;
create index if not exists home_care_plans_patient_idx on home_care_plans (patient_id, starts_on desc);
create index if not exists home_care_plans_client_idx on home_care_plans (client_id, starts_on desc);

create table if not exists home_care_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  kind text not null,
  plan_id uuid references home_care_plans(id) on delete set null,
  item_key text,
  slot smallint,
  for_date date,
  product text,
  value numeric,
  note text,
  photo_url text,
  given_at timestamptz not null default now(),
  source text not null default 'owner',
  created_at timestamptz not null default now()
);

alter table home_care_logs drop constraint if exists home_care_logs_kind_check;
alter table home_care_logs add constraint home_care_logs_kind_check
  check (kind in ('dose', 'task', 'medication', 'deworm', 'parasite', 'supplement', 'weight', 'temperature', 'eating', 'note'));

create index if not exists home_care_logs_patient_idx on home_care_logs (patient_id, given_at desc);
create index if not exists home_care_logs_client_idx on home_care_logs (client_id, given_at desc);
create unique index if not exists home_care_logs_tick_uidx
  on home_care_logs (plan_id, item_key, for_date, slot) where kind in ('dose', 'task');

alter table home_care_plans enable row level security;
alter table home_care_logs enable row level security;
revoke all on home_care_plans from anon, authenticated;
revoke all on home_care_logs from anon, authenticated;

-- The last deworming also counts one the owner logged at home.
create or replace function last_deworming_dates(p_ids uuid[])
returns table (patient_id uuid, last_date date)
language sql
stable
set search_path = public
as $$
  select pid, max(d) from (
    select v.patient_id as pid, (t.created_at at time zone 'Asia/Dubai')::date as d
      from treatment_items t
      join goods_services g on g.id = t.goods_service_id
      join visits v on v.id = t.visit_id
     where v.patient_id = any(p_ids) and is_dewormer(g.name)
    union all
    select h.patient_id, (t.created_at at time zone 'Asia/Dubai')::date
      from treatment_items t
      join goods_services g on g.id = t.goods_service_id
      join hospitalization_notes n on n.id = t.hospitalization_note_id
      join hospitalizations h on h.id = n.hospitalization_id
     where h.patient_id = any(p_ids) and is_dewormer(g.name)
    union all
    select coalesce(v.patient_id, h.patient_id), (i.created_at at time zone 'Asia/Dubai')::date
      from invoice_line_items l
      join invoices i on i.id = l.invoice_id
      left join goods_services g on g.id = l.goods_service_id
      left join visits v on v.id = i.visit_id
      left join hospitalizations h on h.id = i.hospitalization_id
     where coalesce(v.patient_id, h.patient_id) = any(p_ids)
       and is_dewormer(coalesce(g.name, l.description))
       and i.status <> 'void'
    union all
    select hl.patient_id, (hl.given_at at time zone 'Asia/Dubai')::date
      from home_care_logs hl
     where hl.patient_id = any(p_ids) and hl.kind = 'deworm'
  ) x
  group by pid
$$;

revoke all on function last_deworming_dates(uuid[]) from public, anon;
grant execute on function last_deworming_dates(uuid[]) to service_role, authenticated;

-- A deworming the owner logs switches the 6-month reminder on, unless staff
-- chose 3 months or turned it off.
create or replace function home_care_deworm_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'deworm' then
    update patients set deworm_interval_months = 6
     where id = new.patient_id and deworm_interval_months is null;
  end if;
  return new;
end
$$;

revoke all on function home_care_deworm_reminder() from public, anon, authenticated;

drop trigger if exists home_care_logs_deworm_reminder on home_care_logs;
create trigger home_care_logs_deworm_reminder
  after insert on home_care_logs
  for each row execute function home_care_deworm_reminder();
