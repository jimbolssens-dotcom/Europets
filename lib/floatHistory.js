// lib/floatHistory.js
// The Accounting History page (app/(admin)/accounting/history): the old
// system's float sheets (migration 235, scripts/import-old-float.py) set
// beside what the app has recorded since, for comparison only. Pure, so it
// can be tested (tests/float-history.test.mjs); app/api/accounting/history
// does the fetching.
//
// One run of months from Mar 2023: the float up to Sep 2026, the app from
// October 2026 (its first full month: payments started mid-September, while
// the float still took the whole of September). Outgoing comes from the
// float while its cost side was kept in full (to Aug 2026), then from the
// app's expenses, which have every September bill.

import { invoiceMethodGroup, legacyMethodGroup } from './accountingSummary.js';

export const APP_FIRST_FULL_MONTH = '2026-10-01';

const UAE_OFFSET_MS = 4 * 60 * 60 * 1000;
const n = (v) => Number(v || 0);
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// The UAE calendar date (YYYY-MM-DD) of a timestamp, or of a plain date.
export function uaeDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  return new Date(new Date(value).getTime() + UAE_OFFSET_MS).toISOString().slice(0, 10);
}
const monthOf = (value) => `${uaeDate(value).slice(0, 7)}-01`;

// data/oldFloatDays.js -> old_float_days rows.
export function parseFloatDaysCsv(csv, columns) {
  return String(csv)
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const cells = line.split(',');
      const row = {};
      columns.forEach((c, i) => {
        const v = cells[i] ?? '';
        if (c === 'sheet' || c === 'day') row[c] = v;
        else if (c === 'closed') row[c] = v === '1';
        else row[c] = v === '' ? 0 : Number(v);
      });
      return row;
    });
}

// The app's own months: takings by method (payments on new invoices plus
// old-system balances, as on the Accounting overview) and expenses.
export function appMonths({ payments = [], legacyPayments = [], expenses = [] }) {
  const months = new Map();
  const get = (key) => {
    if (!months.has(key)) months.set(key, { takings: 0, cash: 0, card: 0, online: 0, outgoing: 0 });
    return months.get(key);
  };
  const add = (m, group, amount) => {
    m.takings += amount;
    if (group === 'cash' || group === 'card') m[group] += amount;
    else m.online += amount; // online, bank transfer, other: the float's PayPal/transfer column
  };
  for (const p of payments) add(get(monthOf(p.paid_at)), invoiceMethodGroup(p.payment_method), n(p.amount));
  for (const p of legacyPayments) add(get(monthOf(p.paid_at)), legacyMethodGroup(p.payment_method), n(p.amount));
  for (const e of expenses) get(monthOf(e.expense_date)).outgoing += n(e.total);
  return months;
}

// Every month from the first in the float to `now`'s: where each figure
// came from, and the float's net profit where it has one.
export function combinedMonths({ floatMonths = [], app = new Map(), now = Date.now() }) {
  const byMonth = new Map(floatMonths.map((m) => [m.month, m]));
  const keys = [...byMonth.keys()].sort();
  if (!keys.length) return [];
  const last = monthOf(now);
  const out = [];
  for (let key = keys[0]; key <= last; key = nextMonth(key)) {
    const f = byMonth.get(key);
    const a = app.get(key);
    const fromFloat = f && key < APP_FIRST_FULL_MONTH;
    const costsFromFloat = f && f.costs_complete;
    const src = fromFloat ? f : a || {};
    out.push({
      month: key,
      takings: n(src.takings),
      cash: n(src.cash),
      card: n(src.card),
      online: n(src.online),
      outgoing: costsFromFloat ? n(f.outgoing) : n(a?.outgoing),
      netProfit: costsFromFloat && f.net_profit != null ? n(f.net_profit) : null,
      fixedCosts: costsFromFloat ? n(f.fixed_costs) : null,
      source: fromFloat ? 'old' : 'app',
      costSource: costsFromFloat ? 'old' : 'app',
      hasMethods: fromFloat ? f.cash != null : true,
    });
  }
  return out;
}

export function nextMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

// Takings by calendar month, a line per year: { years, values: { year: [12] } }.
export function yearOnYear(months) {
  const values = {};
  for (const m of months) {
    const y = m.month.slice(0, 4);
    if (!values[y]) values[y] = Array(12).fill(null);
    values[y][Number(m.month.slice(5, 7)) - 1] = m.takings || null;
  }
  return { years: Object.keys(values).sort(), values };
}

// Each day's takings from the float's rows (both cash-ups) plus the app's
// payments, keyed by UAE date. Cost-only rows (shift 0) carry no takings.
export function dailyTakings({ floatDays = [], payments = [], legacyPayments = [] }) {
  const days = new Map();
  for (const r of floatDays) {
    if (n(r.shift) === 0 || r.day >= APP_FIRST_FULL_MONTH) continue;
    days.set(r.day, (days.get(r.day) || 0) + n(r.takings));
  }
  for (const p of [...payments, ...legacyPayments]) {
    const d = uaeDate(p.paid_at);
    if (d < APP_FIRST_FULL_MONTH) continue;
    days.set(d, (days.get(d) || 0) + n(p.amount));
  }
  return days;
}

// Average takings on each day of the week, over the days the clinic took
// something.
export function weekdayAverages(days) {
  const sums = WEEKDAYS.map(() => ({ total: 0, count: 0 }));
  for (const [day, total] of days) {
    if (total <= 0) continue;
    const i = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
    sums[i].total += total;
    sums[i].count += 1;
  }
  return WEEKDAYS.map((label, i) => ({ label, value: sums[i].count ? sums[i].total / sums[i].count : 0, count: sums[i].count }));
}

// Takings from the 1st of this month to today, against the same days of
// the same month in each earlier year there's daily data for.
export function monthToDate(days, now = Date.now()) {
  const today = uaeDate(now);
  const [y, m, d] = today.split('-');
  const sumRange = (year) => {
    let total = 0;
    let any = false;
    for (let day = 1; day <= Number(d); day += 1) {
      const key = `${year}-${m}-${String(day).padStart(2, '0')}`;
      if (days.has(key)) {
        total += days.get(key);
        any = true;
      }
    }
    return any ? total : null;
  };
  const rows = [];
  for (let year = Number(y); year >= Number(y) - 3; year -= 1) {
    const total = sumRange(year);
    if (total != null) rows.push({ year: String(year), total });
  }
  return { month: `${y}-${m}-01`, throughDay: Number(d), rows };
}

// The last 12 full months against the 12 before them.
export function trailingYears(months, now = Date.now()) {
  const current = monthOf(now);
  const full = months.filter((m) => m.month < current);
  const last = full.slice(-12);
  const prior = full.slice(-24, -12);
  const sum = (rows, k) => rows.reduce((t, r) => t + n(r[k]), 0);
  if (last.length < 12 || prior.length < 12) return null;
  return {
    from: last[0].month,
    to: last[11].month,
    takings: sum(last, 'takings'),
    priorTakings: sum(prior, 'takings'),
  };
}

// Where the money went, per month on average, over the float's months with
// the full cost side: its daily columns plus the fixed costs under them.
export const COST_LABELS = {
  staff: 'Staff (float)',
  stock: 'Stock',
  wps_salaries: 'WPS salaries',
  clinic_use: 'Clinic use',
  cash_salaries: 'Cash salaries',
  other: 'Other',
  sponsor: 'Sponsor',
  sewa: 'SEWA',
  card_spend: 'Paid by card',
  landline_internet: 'Landline, internet',
  con: 'Con',
};

export function costMix({ floatDays = [], floatMonths = [] }) {
  const complete = new Set(floatMonths.filter((m) => m.costs_complete && m.source === 'daily sheets').map((m) => m.month));
  if (!complete.size) return { months: 0, rows: [] };
  const totals = Object.fromEntries(Object.keys(COST_LABELS).map((k) => [k, 0]));
  for (const r of floatDays) {
    if (!complete.has(`${r.day.slice(0, 7)}-01`)) continue;
    for (const k of ['staff', 'stock', 'clinic_use', 'other', 'card_spend', 'con']) totals[k] += n(r[k]);
  }
  for (const m of floatMonths) {
    if (!complete.has(m.month)) continue;
    for (const k of ['wps_salaries', 'cash_salaries', 'sponsor', 'sewa', 'landline_internet']) totals[k] += n(m[k]);
  }
  const rows = Object.entries(totals)
    .map(([key, total]) => ({ key, label: COST_LABELS[key], value: total / complete.size }))
    .filter((r) => r.value >= 1)
    .sort((a, b) => b.value - a.value);
  return { months: complete.size, rows };
}
