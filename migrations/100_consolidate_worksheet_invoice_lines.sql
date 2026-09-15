-- Migration 100: consolidate a hospitalization worksheet's same medication
-- logged day after day into ONE invoice line (quantity = how many times it
-- was given), instead of a new line every single day.
--
-- source_treatment_item_id (migration 087) tracked exactly one
-- treatment_items row per line, which is what forced one-line-per-day —
-- replaced here with an array so a single consolidated line can point back
-- at every administration it represents. consolidation_key tags a line
-- that was synced from a hospitalization worksheet item (goods_service_id
-- + administration_method) so a later sync finds that same line to bump
-- instead of adding a new one; it's left null for a consult's own one-off
-- treatment plan lines and anything added by hand, which still get their
-- own line each. See lib/invoicing.js.
--
-- This only changes how NEW administrations get synced onto an invoice
-- going forward — it does not rewrite line items already on existing
-- invoices.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table invoice_line_items add column if not exists source_treatment_item_ids uuid[] not null default '{}';

update invoice_line_items
  set source_treatment_item_ids = array[source_treatment_item_id]
  where source_treatment_item_id is not null
    and source_treatment_item_ids = '{}';

alter table invoice_line_items drop column if exists source_treatment_item_id;

alter table invoice_line_items add column if not exists consolidation_key text;

create unique index if not exists invoice_line_items_consolidation_key_idx
  on invoice_line_items (invoice_id, consolidation_key)
  where consolidation_key is not null;
