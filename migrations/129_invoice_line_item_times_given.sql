-- invoice_line_items.quantity has meant two different things depending on
-- how a line was built: for a one-off item, "how much" (3 tablets, one
-- injection of X ml); for a consolidated hospitalization-worksheet item
-- (a medication logged day after day), the SUM of every day's quantity —
-- conflating "how much per dose" with "how many times given", and feeding
-- that combined number straight into the administration fee multiplier (a
-- per-injection fee that ended up scaled by total volume instead of number
-- of injections whenever a single dose wasn't exactly 1 unit).
--
-- times_given separates the two: quantity is now always the locked
-- per-dose/per-event amount, times_given is how many times it was given.
-- Existing rows are backfilled by dividing their old (summed) quantity by
-- their source_treatment_item_ids count, so quantity * times_given still
-- equals exactly what was already billed — no invoice's total changes from
-- this migration. A one-off line's source array always has exactly one id,
-- so its quantity is unchanged and times_given stays 1.
alter table invoice_line_items add column if not exists times_given integer not null default 1;

update invoice_line_items
set times_given = greatest(1, coalesce(array_length(source_treatment_item_ids, 1), 1)),
    quantity = round(quantity / greatest(1, coalesce(array_length(source_treatment_item_ids, 1), 1)), 2)
where coalesce(array_length(source_treatment_item_ids, 1), 1) > 1;
