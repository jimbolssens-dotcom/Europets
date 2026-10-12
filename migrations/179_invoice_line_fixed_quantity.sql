-- Migration 179: an invoice line whose charge stays fixed
--
-- A consolidated worksheet line (e.g. Optiflox eye drops) normally grows
-- with every new dose logged on the stay. For something charged once
-- regardless of doses (one bottle of eye drops for the whole course),
-- staff fix the line: later doses are still linked to it (so the sync
-- knows they're billed), but its quantity, count and total no longer
-- change. See lib/invoicing.js syncInvoiceTreatmentItems.
--
-- Safe to run more than once.

alter table invoice_line_items
    add column if not exists fixed_quantity boolean not null default false;
