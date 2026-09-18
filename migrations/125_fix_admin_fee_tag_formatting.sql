-- Migration 125: repair administration-fee tags mangled by migration 124
--
-- Migration 124's merge step reformatted a line's dose-count tag using
-- Postgres's numeric-to-text cast, which keeps the column's declared scale
-- -- "×5.00" instead of "×5". The app's own tag-stripping regex
-- (lib/invoicing.js#stripAdministrationFeeTag) only recognizes a plain
-- integer count (`\d+`, no decimal point), so it couldn't find and remove
-- that "×5.00" tag on the next real sync -- it just appended a fresh one
-- instead, producing a doubled-up description like
-- "Cortamethazone (Dexa) per ml (SC ×5.00) (SC ×6)". The dollar amounts
-- were never wrong (line_total isn't computed from the description text) --
-- this is a text-only repair.
--
-- For every invoice_line_items row with an administration_method, this
-- strips every trailing fee tag it finds (handles one or several stacked
-- tags) down to the true base description, then reapplies exactly one
-- tag in the app's own format (integer count, no tag at all for a
-- dispensed/single administration). A no-op for any row that was already
-- correctly formatted.
--
-- Scoped to open (unpaid/partially_paid) invoices, same as migration 124.
-- Run this once, in the Supabase SQL editor. Safe to re-run.

create temporary table _tag_fix_report (
  invoice_id uuid,
  old_description text,
  new_description text
);

do $$
declare
  row_ record;
  cleaned text;
  effective_count numeric;
  count_text text;
  new_description text;
begin
  for row_ in
    select ili.id, ili.invoice_id, ili.description, ili.quantity, ili.administration_method
    from invoice_line_items ili
    join invoices inv on inv.id = ili.invoice_id
    where ili.administration_method is not null
      and inv.status in ('unpaid', 'partially_paid')
  loop
    cleaned := row_.description;
    loop
      exit when cleaned !~ ' \((DIS|SC|IM)( ×[0-9]+(\.[0-9]+)?)?\)$';
      cleaned := regexp_replace(cleaned, ' \((DIS|SC|IM)( ×[0-9]+(\.[0-9]+)?)?\)$', '');
    end loop;

    effective_count := case when row_.administration_method = 'dispense' then 1 else row_.quantity end;
    count_text := trim_scale(effective_count)::text;

    new_description := cleaned || ' (' ||
      (case row_.administration_method when 'dispense' then 'DIS' when 'sc' then 'SC' when 'im' then 'IM' end) ||
      (case when effective_count > 1 then ' ×' || count_text else '' end) || ')';

    if new_description is distinct from row_.description then
      update invoice_line_items set description = new_description where id = row_.id;
      insert into _tag_fix_report values (row_.invoice_id, row_.description, new_description);
    end if;
  end loop;
end $$;

select * from _tag_fix_report order by invoice_id;
