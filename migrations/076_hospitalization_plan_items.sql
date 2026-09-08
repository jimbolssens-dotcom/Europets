-- Migration 076: hospitalization day treatment plan
--
-- A per-admission set of recurring/one-off care tasks (meds, checks,
-- routine care like cage cleaning) shown as tap-to-log buttons on the
-- hospitalization page (admin + mobile). The task list itself lives here;
-- each tap creates a normal hospitalization_notes row (via the existing
-- POST /api/hospitalizations/:id/notes route) tagged with plan_item_id
-- below, so the log is just what's already in the day-to-day worksheet —
-- no separate audit table needed.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists hospitalization_plan_items (
    id uuid primary key default gen_random_uuid(),
    hospitalization_id uuid references hospitalizations(id) on delete cascade not null,
    label text not null,                      -- button text, e.g. "Amoxicillin 250mg" or "Cage Cleaned"
    goods_service_id uuid references goods_services(id),  -- set for a catalog-linked task (meds/services); null for routine care
    instructions text,                        -- dosage/frequency, e.g. "PO with food, twice daily"
    created_at timestamptz default now()
);

alter table hospitalization_plan_items disable row level security;

-- set null (not cascade) so deleting a plan item/button doesn't erase the
-- historical worksheet entries it already created.
alter table hospitalization_notes
  add column if not exists plan_item_id uuid references hospitalization_plan_items(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hospitalization_plan_items'
  ) then
    execute 'alter publication supabase_realtime add table hospitalization_plan_items';
  end if;
end $$;
