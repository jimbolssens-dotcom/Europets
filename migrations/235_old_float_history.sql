-- Migration 235: the old system's float sheets, as history to compare against
--
-- Jim's two "master float" spreadsheets from before the app: a row per
-- cash-up (two a day) from Jan 2025 to Sep 2026, and month totals back to
-- Mar 2023 from the yearly summary sheets. Imported by
-- scripts/import-old-float.py. Purely for comparison (the Accounting
-- History page): nothing in the app writes to these tables or reads them
-- for anything else, and the import touches no other table.
--
--   old_float_days    one row per spreadsheet row: takings by method, the
--                     day's outgoing by column. shift 1 and 2 are the day's
--                     two cash-ups; shift 0 is a cost row the sheet keeps
--                     outside the month's dates (the week the month starts
--                     or ends in), dated the 1st or last day of the month.
--   old_float_months  one row per month. From the daily rows when there
--                     are any (source 'daily sheets'), otherwise from the
--                     yearly summary ('yearly summary'). The sheet's own
--                     figures ride along (sheet_*, summary_*) where they
--                     differ, e.g. Sep 2025, whose last weekly total left
--                     out the 29th and 30th.
--
-- Server-only, like legacy_payments (migration 187): RLS on, no policy;
-- read with the service role. Safe to run more than once.

create table if not exists old_float_days (
  sheet text not null,
  sheet_row integer not null,
  day date not null,
  shift smallint not null,
  closed boolean not null default false,
  cash numeric(12,2) not null default 0,
  card numeric(12,2) not null default 0,
  online numeric(12,2) not null default 0,       -- PayPal / transfer
  takings numeric(12,2) not null default 0,
  profile_takings numeric(12,2) not null default 0,
  partial_payments numeric(12,2) not null default 0,
  vat_collected numeric(12,2) not null default 0,
  stock numeric(12,2) not null default 0,
  clinic_use numeric(12,2) not null default 0,
  vat_paid numeric(12,2) not null default 0,
  staff numeric(12,2) not null default 0,
  con numeric(12,2) not null default 0,
  other numeric(12,2) not null default 0,
  card_spend numeric(12,2) not null default 0,   -- the outgoing "Visa" column
  outgoing numeric(12,2) not null default 0,
  gross numeric(12,2) not null default 0,
  primary key (sheet, sheet_row)
);
create index if not exists old_float_days_day on old_float_days (day);

create table if not exists old_float_months (
  month date primary key,
  source text not null check (source in ('daily sheets', 'yearly summary')),
  takings numeric(12,2),
  cash numeric(12,2),
  card numeric(12,2),
  online numeric(12,2),
  outgoing numeric(12,2),
  gross_profit numeric(12,2),
  fixed_costs numeric(12,2),
  sponsor numeric(12,2),
  landline_internet numeric(12,2),
  wps_salaries numeric(12,2),
  cash_salaries numeric(12,2),
  sewa numeric(12,2),
  net_profit numeric(12,2),
  vat_collected numeric(12,2),
  vat_paid numeric(12,2),
  costs_complete boolean not null default true,
  sheet_takings numeric(12,2),
  sheet_net_profit numeric(12,2),
  summary_takings numeric(12,2),
  summary_outgoing numeric(12,2),
  summary_net_profit numeric(12,2),
  note text
);

alter table old_float_days enable row level security;
alter table old_float_months enable row level security;
