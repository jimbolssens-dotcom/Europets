-- Migration 126: backfill invoice_line_items that never got a
-- consolidation_key at all (an older leftover than migration 124's)
--
-- Migration 124 fixed lines with a STALE 2-segment key (a real key, just in
-- the old format). This fixes an even OLDER leftover: lines created before
-- consolidation_key existed as a concept at all, which were never given one
-- — lib/invoicing.js#syncInvoiceTreatmentItems's "does a line with this key
-- already exist" lookup only ever matches a non-null key, so these have
-- been permanently invisible to it since the day that logic shipped, and
-- every dose logged since then just lands on ANOTHER new line instead of
-- ever finding these. Symptom: a hospitalization invoice with many
-- identical single-quantity-1 lines for the same medication/method sitting
-- next to one correctly-consolidated line for the same thing (the doses
-- logged after this app's current consolidation logic went live).
--
-- Deliberately conservative about WHICH null-key lines this touches:
--   - only lines on an open (unpaid/partially_paid) hospitalization invoice
--   - only where the line's own treatment_item(s) actually have
--     hospitalization_note_id set (a genuine worksheet/recurring item —
--     never a real one-off consult item, which is SUPPOSED to keep
--     consolidation_key null forever)
--   - only where the description carries NO per-dose instructions text
--     (i.e. it's exactly "<catalog name>" or "<catalog name> (DIS/SC/IM
--     ×N)", with no " — ..." suffix). A line with real instructions typed
--     against that specific dose is left untouched rather than silently
--     merged away and losing that note.
--
-- Run this once, in the Supabase SQL editor. Safe to re-run: once every
-- eligible line has a key, there's nothing left for it to match.
-- The final SELECT lists everything it changed, for review.

create temporary table _null_key_backfill_report (
  action text,
  invoice_id uuid,
  description text,
  new_key text,
  quantity numeric,
  line_total numeric
);

do $$
declare
  clinic record;
  grp record;
  member record;
  sibling record;
  survivor_id uuid;
  survivor_qty numeric;
  survivor_sources uuid[];
  survivor_unit_price numeric;
  member_count int;
  fee_per_admin numeric;
  effective_count numeric;
  base_description text;
  new_description text;
  new_total numeric;
begin
  select * into clinic from clinic_settings where id = true;

  for grp in
    select
      inv.id as invoice_id,
      ili.goods_service_id,
      ili.administration_method,
      inv.hospitalization_id,
      gs.name as catalog_name,
      (ili.goods_service_id::text || ':' || coalesce(ili.administration_method, 'none') || ':' || inv.hospitalization_id::text) as computed_key
    from invoice_line_items ili
    join invoices inv on inv.id = ili.invoice_id
    join goods_services gs on gs.id = ili.goods_service_id
    where ili.consolidation_key is null
      and inv.hospitalization_id is not null
      and inv.status in ('unpaid', 'partially_paid')
      and regexp_replace(ili.description, ' \((DIS|SC|IM)( ×[0-9]+(\.[0-9]+)?)?\)$', '') = gs.name
      and exists (
        select 1 from treatment_items ti
        where ti.id = any(ili.source_treatment_item_ids)
          and ti.hospitalization_note_id is not null
      )
    group by inv.id, ili.goods_service_id, ili.administration_method, inv.hospitalization_id, gs.name
  loop
    select id, quantity, source_treatment_item_ids, unit_price
      into sibling
      from invoice_line_items
      where invoice_id = grp.invoice_id and consolidation_key = grp.computed_key
      limit 1;

    survivor_id := sibling.id;
    survivor_qty := coalesce(sibling.quantity, 0);
    survivor_sources := coalesce(sibling.source_treatment_item_ids, array[]::uuid[]);
    survivor_unit_price := sibling.unit_price;
    member_count := 0;

    for member in
      select ili.id, ili.quantity, ili.unit_price, ili.source_treatment_item_ids
      from invoice_line_items ili
      where ili.invoice_id = grp.invoice_id
        and ili.consolidation_key is null
        and ili.goods_service_id = grp.goods_service_id
        and coalesce(ili.administration_method, 'none') = coalesce(grp.administration_method, 'none')
        and regexp_replace(ili.description, ' \((DIS|SC|IM)( ×[0-9]+(\.[0-9]+)?)?\)$', '') = grp.catalog_name
        and exists (
          select 1 from treatment_items ti
          where ti.id = any(ili.source_treatment_item_ids)
            and ti.hospitalization_note_id is not null
        )
    loop
      member_count := member_count + 1;
      if survivor_id is null then
        survivor_id := member.id;
        survivor_qty := member.quantity;
        survivor_sources := member.source_treatment_item_ids;
        survivor_unit_price := member.unit_price;
      else
        survivor_qty := survivor_qty + member.quantity;
        survivor_sources := (select array_agg(distinct x) from unnest(survivor_sources || member.source_treatment_item_ids) x);
        delete from invoice_line_items where id = member.id;
      end if;
    end loop;

    if survivor_id is null then
      continue;
    end if;

    -- A lone null-key line with no sibling to merge into (and nothing else
    -- absorbed into it) just needs its key set — nothing else about it
    -- changed, so leave description/quantity/total exactly as they are.
    if sibling.id is null and member_count <= 1 then
      update invoice_line_items set consolidation_key = grp.computed_key where id = survivor_id;
      insert into _null_key_backfill_report values
        ('renamed', grp.invoice_id, grp.catalog_name, grp.computed_key, survivor_qty, null);
      continue;
    end if;

    fee_per_admin := case grp.administration_method
      when 'dispense' then coalesce(clinic.dispensing_fee, 0)
      when 'sc' then coalesce(clinic.sc_injection_fee, 0)
      when 'im' then coalesce(clinic.im_injection_fee, 0)
      else 0
    end;
    effective_count := case when grp.administration_method = 'dispense' then 1 else survivor_qty end;

    if grp.administration_method is null or fee_per_admin <= 0 then
      new_description := grp.catalog_name;
      new_total := round((survivor_unit_price * survivor_qty)::numeric, 2);
    else
      new_description := grp.catalog_name || ' (' ||
        (case grp.administration_method when 'dispense' then 'DIS' when 'sc' then 'SC' when 'im' then 'IM' end) ||
        (case when effective_count > 1 then ' ×' || trim_scale(effective_count)::text else '' end) || ')';
      new_total := round((survivor_unit_price * survivor_qty + fee_per_admin * effective_count)::numeric, 2);
    end if;

    update invoice_line_items
      set consolidation_key = grp.computed_key,
          quantity = survivor_qty,
          description = new_description,
          line_total = new_total,
          source_treatment_item_ids = survivor_sources
      where id = survivor_id;

    insert into _null_key_backfill_report values
      ('consolidated', grp.invoice_id, new_description, grp.computed_key, survivor_qty, new_total);
  end loop;

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
    and i.id in (select distinct invoice_id from _null_key_backfill_report);
end $$;

select * from _null_key_backfill_report order by invoice_id, description;
