-- 225_personal_logins.sql
-- Personal logins (lib/personalLogin.js): a staff member (an intern,
-- migration 223) can get their own 6-digit login code on the Staff page,
-- instead of the shared staff PIN. Only its sha256 is kept. It works only
-- while they're active and before the end of their last day
-- (access_until), checked on every request, so switching them off ends it
-- straight away. Safe to run more than once.

alter table staff add column if not exists login_code_hash text;
alter table staff add column if not exists login_code_set_at timestamptz;
create unique index if not exists staff_login_code_hash_unique on staff (login_code_hash) where login_code_hash is not null;
