-- Migration 087: tag an invoice_line_items row with the treatment_items
-- row it was auto-imported from, so an invoice can be re-synced later
-- (see app/api/visits/[id]/invoice and app/api/hospitalizations/[id]/
-- invoice) without re-adding the same medication twice. Left null for a
-- line item added by hand directly on the invoice. On delete set null
-- (not cascade): deleting the worksheet entry that logged a medication
-- must not touch an invoice that already billed it (existing convention
-- on this codebase — see the hospitalization worksheet's own delete
-- confirmation).

alter table invoice_line_items add column if not exists source_treatment_item_id uuid
  references treatment_items(id) on delete set null;
