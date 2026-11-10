-- Migration 246: every logged deworming switches on a 6-month reminder (Jim, 10 Nov)
--
-- When a dewormer is logged for a patient (a treatment item on a consult or
-- a hospital stay's worksheet), the patient's deworming reminder is set to
-- every 6 months, unless staff already chose 3 months or turned it off.
-- deworm_interval_months: null = never set, 0 = turned off on purpose (so a
-- later deworming doesn't switch it back on), 3 or 6 = remind every so many
-- months (migration 245, lib/deworming.js).
--
-- The last deworming now also counts logged treatments, not only invoice
-- lines, as some are logged before the invoice is made.
--
-- Changes a constraint and functions, adds a trigger. Safe to run more than once.

alter table patients drop constraint if exists patients_deworm_interval_check;
alter table patients add constraint patients_deworm_interval_check
  check (deworm_interval_months is null or deworm_interval_months in (0, 3, 6));

create or replace function is_dewormer(item_name text)
returns boolean
language sql
immutable
as $$
  select coalesce(item_name, '') ~* '(deworm|vermis|milbemax|drontal|profender|panacur|broadline|advocate|nexgard spectra|simparica trio|credelio plus|stronghold plus|milpro|cestem|endogard)'
$$;

-- The last day each patient was dewormed (Dubai date): logged on a consult
-- or a stay, or charged on an invoice.
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
  ) x
  group by pid
$$;

revoke all on function last_deworming_dates(uuid[]) from public, anon;
grant execute on function last_deworming_dates(uuid[]) to service_role, authenticated;

-- A dewormer logged on a consult or stay: switch the reminder on at 6
-- months if nobody has set it yet.
create or replace function deworming_auto_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
begin
  if new.goods_service_id is null then return new; end if;
  if not exists (select 1 from goods_services g where g.id = new.goods_service_id and is_dewormer(g.name)) then
    return new;
  end if;
  if new.visit_id is not null then
    select v.patient_id into pid from visits v where v.id = new.visit_id;
  elsif new.hospitalization_note_id is not null then
    select h.patient_id into pid
      from hospitalization_notes n join hospitalizations h on h.id = n.hospitalization_id
     where n.id = new.hospitalization_note_id;
  end if;
  if pid is not null then
    update patients set deworm_interval_months = 6
     where id = pid and deworm_interval_months is null;
  end if;
  return new;
end
$$;

revoke all on function deworming_auto_reminder() from public, anon, authenticated;

drop trigger if exists treatment_items_deworming_reminder on treatment_items;
create trigger treatment_items_deworming_reminder
  after insert or update of goods_service_id on treatment_items
  for each row execute function deworming_auto_reminder();
