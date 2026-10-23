-- 221_finance_group_reception.sql
-- The team chat's Finance group (migration 219) is admin and reception:
-- reception takes the payments and answers the bills questions too.
-- Safe to run more than once.

update team_groups set roles = array['admin', 'reception'] where key = 'finance';
