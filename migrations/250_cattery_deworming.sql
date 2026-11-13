-- Migration 250: a dewormer on a cattery invoice counts (Jim, 13 Nov)
--
-- A cattery invoice has no visit or stay, so a dewormer billed on it
-- (e.g. Vermis-EX given during boarding) counted for no cat: the pet's
-- last deworming and its reminder ignored it. Now it counts for the cat on
-- the booking, dated the day the cat checked in, once it has checked in.
--
-- A shared bungalow (cattery_booking_cats, migration 183): every cat on the
-- booking counts only when the invoice has at least one dewormer per cat.
-- With fewer it isn't known which cat had it, so none is counted and staff
-- set it on the cat's Deworm chip. A cat alone counts for any amount
-- (half a tablet too).
--
-- Like every other logged dewormer (migration 246), it also switches the
-- cat's reminder on at 6 months unless it was set to 3 or turned off (0).
--
-- Replaces two functions and adds a trigger. Safe to run more than once.

create or replace function cattery_deworming_cats()
returns table (patient_id uuid, booking_id uuid, given_on date)
language sql
stable
set search_path = public
as $$
  select c.pid, b.id, b.date_in
    from cattery_bookings b
    join invoices i on i.id = b.invoice_id and i.status <> 'void'
    join lateral (
      select sum(l.quantity * coalesce(nullif(l.times_given, 0), 1)) as qty
        from invoice_line_items l
        left join goods_services g on g.id = l.goods_service_id
       where l.invoice_id = b.invoice_id and is_dewormer(coalesce(g.name, l.description))
    ) q on q.qty > 0
    join lateral (
      select 1 + count(*) as n from cattery_booking_cats bc where bc.booking_id = b.id
    ) cats on true
    join lateral (
      select b.patient_id as pid
      union all
      select bc.patient_id from cattery_booking_cats bc where bc.booking_id = b.id
    ) c on true
   where b.status in ('checked_in', 'checked_out')
     and (cats.n = 1 or q.qty >= cats.n)
$$;

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
    union all
    select cd.patient_id, cd.given_on
      from cattery_deworming_cats() cd
     where cd.patient_id = any(p_ids)
  ) x
  group by pid
$$;

grant execute on function last_deworming_dates(uuid[]) to service_role, authenticated;
revoke all on function cattery_deworming_cats() from public, anon;
grant execute on function cattery_deworming_cats() to service_role, authenticated;

-- Check-in (or a later change of the booking) switches the reminder on.
create or replace function cattery_bookings_deworming_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('checked_in', 'checked_out') then
    update patients p set deworm_interval_months = 6
      from cattery_deworming_cats() cd
     where cd.booking_id = new.id and p.id = cd.patient_id
       and p.deworm_interval_months is null;
  end if;
  return new;
end
$$;

drop trigger if exists cattery_bookings_deworming_reminder on cattery_bookings;
create trigger cattery_bookings_deworming_reminder
  after insert or update of status, invoice_id on cattery_bookings
  for each row execute function cattery_bookings_deworming_reminder();

-- Cats already boarded with a dewormer on their cattery invoice.
update patients p set deworm_interval_months = 6
  from cattery_deworming_cats() cd
 where p.id = cd.patient_id and p.deworm_interval_months is null;
