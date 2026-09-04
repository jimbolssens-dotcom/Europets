-- Migration 049: dispensing info on invoice line items
--
-- invoice_line_items only ever had the dosage/frequency instructions baked
-- into its free-text `description` (e.g. "Doxycycline — give 1 tablet
-- twice daily for 5 days"), with no way to read them back out separately,
-- and no record of how the medication was given (dispensed to go home vs.
-- an SC/IM injection given in-clinic). The dispensing label feature (see
-- the invoice detail page) needs both: `instructions` to print on the
-- label (editable there before printing), and `administration_method` to
-- default-select only the medications actually sent home with the owner,
-- not ones given as an in-clinic injection.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table invoice_line_items add column if not exists instructions text;
alter table invoice_line_items add column if not exists administration_method text
    check (administration_method in ('dispense', 'sc', 'im'));
