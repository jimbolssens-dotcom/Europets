-- Migration 020: split goods_services' single free-text "category" into a
-- fixed main_category (product / test / service) plus a subcategory staff
-- can keep extending — e.g. adding a new test type as the clinic starts
-- offering it — via the new catalog_subcategories table.
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists catalog_subcategories (
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
    ('service', 'General')
on conflict (main_category, name) do nothing;

alter table goods_services add column if not exists main_category text;
alter table goods_services add column if not exists subcategory_id uuid references catalog_subcategories(id);

-- Map the old free-text category onto the new structure. Only meaningful
-- while the old column still exists — a fresh install (schema.sql) never
-- has it, and re-running this migration after it's already dropped is a
-- no-op here.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_name = 'goods_services' and column_name = 'category'
    ) then
        update goods_services set main_category = case category
            when 'medication' then 'product'
            when 'food' then 'product'
            when 'toy' then 'product'
            when 'product' then 'product'
            when 'service' then 'service'
            when 'procedure' then 'service'
            else 'product'
        end
        where main_category is null;

        update goods_services gs set subcategory_id = (
            select cs.id from catalog_subcategories cs
            where cs.main_category = gs.main_category
            and cs.name = case gs.category
                when 'medication' then 'Medication'
                when 'food' then 'Food'
                when 'toy' then 'Toys'
                when 'product' then 'Other'
                when 'service' then 'General'
                when 'procedure' then 'General'
                else 'Other'
            end
        )
        where gs.subcategory_id is null;

        alter table goods_services drop column category;
    end if;
end $$;

-- Fallback for any row still missing one (shouldn't happen from the
-- mapping above, but keeps the not-null constraint below from ever failing).
update goods_services set main_category = 'product' where main_category is null;
alter table goods_services alter column main_category set not null;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'goods_services_main_category_check'
    ) then
        alter table goods_services add constraint goods_services_main_category_check
            check (main_category in ('product', 'test', 'service'));
    end if;
end $$;

create index if not exists idx_goods_services_main_category on goods_services(main_category);
create index if not exists idx_goods_services_subcategory on goods_services(subcategory_id);
