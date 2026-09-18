-- Migration 124: backfill stale invoice_line_items.consolidation_key values
--
-- Root cause of "medication consolidation stopped working" on hospitalization
-- invoices: consolidation_key used to be just `${goods_service_id}:${method}`
-- (2 segments). At some point it grew a third segment,
-- `:${_sourceHospitalizationId}`, so a merged invoice (migration 114) can
-- tell which source case a recurring line belongs to. That change was never
-- paired with a data migration to rewrite EXISTING lines' keys to the new
-- 3-segment format — so every line created before that point is permanently
-- unfindable by lib/invoicing.js#syncInvoiceTreatmentItems's "does a line
-- with this key already exist" lookup (it always computes the new 3-segment
-- key), and every dose logged since has been landing on a brand-new line
-- instead of bumping the old one's quantity.
--
-- This is a one-time backfill: for every 2-segment key on an open
-- (unpaid/partially_paid) invoice linked to a hospitalization, either
-- - rename it to the 3-segment form (old_key || ':' || hospitalization_id),
--   if nothing else on that invoice already uses that key, or
-- - merge it into the sibling line that already uses the 3-segment form
--   (summing quantity, recombining source_treatment_item_ids, and
--   recomputing the line total/administration-fee tag the same way
--   lib/invoicing.js#syncInvoiceTreatmentItems does), if one exists.
--
-- Paid/void invoices are deliberately left untouched -- their billing is
-- already settled and shouldn't be rewritten after the fact.
--
-- Run this once, in the Supabase SQL editor. Safe to re-run: once every key
-- is in the 3-segment form, there's nothing left for it to do. The final
-- SELECT lists everything it changed, for review.

create temporary table _key_backfill_report (
  action text,
  invoice_id uuid,
  description text,
  old_key text,
  new_key text,
  quantity numeric,
  line_total numeric
);

do $$
declare
  clinic record;
  row_ record;
  sibling record;
  new_key text;
  fee_per_admin numeric;
  effective_count numeric;
  base_description text;
  new_description text;
  new_total numeric;
  new_quantity numeric;
begin
  select * into clinic from clinic_settings where id = true;

  for row_ in
    select ili.id, ili.invoice_id, ili.description, ili.quantity, ili.unit_price,
           ili.administration_method, ili.consolidation_key, ili.source_treatment_item_ids,
           inv.hospitalization_id, inv.status, inv.discount_amount
    from invoice_line_items ili
    join invoices inv on inv.id = ili.invoice_id
    where ili.consolidation_key is not null
      and array_length(regexp_split_to_array(ili.consolidation_key, ':'), 1) = 2
      and inv.hospitalization_id is not null
      and inv.status in ('unpaid', 'partially_paid')
  loop
    new_key := row_.consolidation_key || ':' || row_.hospitalization_id::text;

    select id, quantity, source_treatment_item_ids
      into sibling
      from invoice_line_items
      where invoice_id = row_.invoice_id and consolidation_key = new_key
      limit 1;

    if sibling.id is null then
      -- No 3-segment sibling yet -- just rename this line's key so future
      -- syncs (which always compute the 3-segment form) can find it.
      update invoice_line_items set consolidation_key = new_key where id = row_.id;

      insert into _key_backfill_report values
        ('renamed', row_.invoice_id, row_.description, row_.consolidation_key, new_key, row_.quantity, null);
    else
      -- A sibling already exists under the new key -- merge this line into
      -- it, recomputing quantity/description/fee/total the same way
      -- lib/invoicing.js#syncInvoiceTreatmentItems would.
      new_quantity := sibling.quantity + row_.quantity;
      base_description := regexp_replace(row_.description, ' \((DIS|SC|IM)( ×[0-9]+)?\)$', '');

      fee_per_admin := case row_.administration_method
        when 'dispense' then coalesce(clinic.dispensing_fee, 0)
        when 'sc' then coalesce(clinic.sc_injection_fee, 0)
        when 'im' then coalesce(clinic.im_injection_fee, 0)
        else 0
      end;
      effective_count := case when row_.administration_method = 'dispense' then 1 else new_quantity end;

      if row_.administration_method is null or fee_per_admin <= 0 then
        new_description := base_description;
        new_total := round((row_.unit_price * new_quantity)::numeric, 2);
      else
        new_description := base_description || ' (' ||
          (case row_.administration_method when 'dispense' then 'DIS' when 'sc' then 'SC' when 'im' then 'IM' end) ||
          (case when effective_count > 1 then ' ×' || effective_count::text else '' end) || ')';
        new_total := round((row_.unit_price * new_quantity + fee_per_admin * effective_count)::numeric, 2);
      end if;

      update invoice_line_items
        set quantity = new_quantity,
            description = new_description,
            line_total = new_total,
            source_treatment_item_ids = (
              select array_agg(distinct x) from unnest(
                sibling.source_treatment_item_ids || row_.source_treatment_item_ids
              ) x
            )
        where id = sibling.id;

      delete from invoice_line_items where id = row_.id;

      insert into _key_backfill_report values
        ('merged', row_.invoice_id, new_description, row_.consolidation_key, new_key, new_quantity, new_total);
    end if;
  end loop;

  -- Recompute subtotal/VAT/total on every invoice this touched, same math
  -- as lib/invoicing.js#recomputeInvoiceTotals.
  update invoices i
  set
    subtotal = sums.subtotal,
    vat_amount = round(greatest(sums.subtotal - i.discount_amount, 0) * 0.05, 2),
    total = round(greatest(sums.subtotal - i.discount_amount, 0) * 1.05, 2)
  from (
    select invoice_id, round(sum(line_total)::numeric, 2) as subtotal
    from invoice_line_items
    group by invoice_id
  ) sums
  where sums.invoice_id = i.id
    and i.id in (select distinct invoice_id from _key_backfill_report);
end $$;

select * from _key_backfill_report order by invoice_id, action;
