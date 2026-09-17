-- Migration 110: attribute an expense to a staff member
--
-- Lets any logged expense (a salary payment, fuel for someone's use of the
-- clinic car, a reimbursement, ...) be tied to the staff member it's for —
-- powers the new Accounting > Staff Expenses page, and shows up as an
-- editable "Staff" column on the main Expenses list too. Nullable: most
-- expenses (rent, utilities, clinic supplies) aren't anyone's in
-- particular. on delete set null so removing a staff record — which
-- shouldn't happen anyway once they have expense history, see
-- staff.active — never takes a real expense record down with it.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table expenses add column if not exists staff_id uuid references staff(id) on delete set null;
create index if not exists idx_expenses_staff on expenses(staff_id);
