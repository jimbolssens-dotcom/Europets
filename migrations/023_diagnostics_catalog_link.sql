-- Migration 023: link diagnostics directly to the catalog's Test items,
-- instead of a fixed free-text type list — and automatically add the
-- chosen test to the treatment plan (treatment_items), so it flows
-- straight into invoicing without a separate manual step.
-- Run this in your Supabase SQL editor. Safe to run more than once.

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_name = 'diagnostics' and column_name = 'type' and is_nullable = 'NO'
    ) then
        alter table diagnostics alter column type drop not null;
    end if;
end $$;

alter table diagnostics add column if not exists goods_service_id uuid references goods_services(id);

-- on delete set null (not cascade): if the line is removed straight from
-- the treatment plan, the diagnostic and its results/attachments stay,
-- just unbilled.
alter table diagnostics add column if not exists treatment_item_id uuid
    references treatment_items(id) on delete set null;
