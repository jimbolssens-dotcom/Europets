-- migrations/042_invoice_payments_require_staff.sql
-- Every logged payment must be attributed to the staff member who took
-- it — received_by was previously optional. If this fails with a
-- not-null violation, there are existing invoice_payments rows with no
-- received_by; back those out (e.g. attribute them to a specific staff
-- member) before re-running.

alter table invoice_payments alter column received_by set not null;
