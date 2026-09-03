-- 036_catalog_cost_and_supplier.sql
-- Adds cost tracking to the catalog: what the clinic pays (buying_price)
-- and who it's ordered from (supplier), alongside the existing base_price
-- (what the client is charged). Both nullable — most items added by hand
-- through the Catalog page won't bother filling these in.

alter table goods_services
    add column if not exists buying_price numeric(10,2),
    add column if not exists supplier text;

alter table goods_services disable row level security;
