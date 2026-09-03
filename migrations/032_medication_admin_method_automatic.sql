-- Migration 032: a medication now has one administration method
-- (dispense/sc/im), not three independent checkboxes — its fee is
-- applied automatically wherever that medication is added (treatment
-- plan or straight to an invoice), no per-booking selection anymore.
-- Waiving it in the rare exceptional case is just removing that fee
-- line from the invoice afterward, same as removing any other line.
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table goods_services add column if not exists administration_method text
    check (administration_method in ('dispense', 'sc', 'im'));

-- One-time carry-over from the earlier three-checkbox version, only if
-- those columns are still present (first run only — safe to re-run).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'goods_services' and column_name = 'allow_dispense'
  ) then
    update goods_services
    set administration_method = case
        when allow_dispense then 'dispense'
        when allow_sc then 'sc'
        when allow_im then 'im'
        else administration_method
    end
    where administration_method is null and (allow_dispense or allow_sc or allow_im);

    alter table goods_services drop column allow_dispense;
    alter table goods_services drop column allow_sc;
    alter table goods_services drop column allow_im;
  end if;
end $$;
