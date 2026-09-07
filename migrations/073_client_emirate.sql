-- Which of the UAE's 7 emirates a client is based in (see lib/emirates.js)
-- — distinct from emirates_id, their Emirates ID card number. Also staged
-- on intake_requests, same as the other owner fields it collects before
-- a client row exists.
alter table clients add column if not exists emirate text;
alter table intake_requests add column if not exists emirate text;
