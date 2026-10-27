// lib/accountingCharts.js
// The figures behind the Accounting charts page (app/(admin)/accounting/
// charts): rows from app/api/accounting/charts bucketed by week or month in
// the clinic's own time (UAE, UTC+4), weeks starting Monday. Pure, so it can
// be tested (tests/accounting-charts.test.mjs). Payment methods are grouped
// exactly as on the Accounting overview (lib/accountingSummary.js), so the
// two pages agree.

import { invoiceMethodGroup, legacyMethodGroup } from './accountingSummary.js';
import { billAmountForDiscount } from './supporterBonusPlan.js';

const UAE_OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Everything up to here was imported from the old system on 7 Sep 2026, not
// a new client: clients #1 to #30040 all arrived in that one batch.
export const LAST_IMPORTED_CLIENT_NUMBER = 30040;

// The UAE calendar date (YYYY-MM-DD) of a timestamp, or of a plain date.
function uaeDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  return new Date(new Date(value).getTime() + UAE_OFFSET_MS).toISOString().slice(0, 10);
}

// The bucket a date falls in: the Monday of its week, or the 1st of its month.
export function bucketKey(value, unit) {
  const date = uaeDate(value);
  if (unit === 'month') return `${date.slice(0, 7)}-01`;
  const d = new Date(`${date}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // days since Monday
  return new Date(d.getTime() - back * DAY_MS).toISOString().slice(0, 10);
}

// The last `count` buckets up to and including the one `now` is in.
export function bucketsUpTo(now, unit, count) {
  const keys = [bucketKey(now, unit)];
  while (keys.length < count) {
    const first = keys[0];
    if (unit === 'month') {
      const [y, m] = first.split('-').map(Number);
      const prev = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
      keys.unshift(prev);
    } else {
      keys.unshift(new Date(new Date(`${first}T00:00:00Z`).getTime() - 7 * DAY_MS).toISOString().slice(0, 10));
    }
  }
  return keys;
}

// Where the range starts, as a UTC timestamp, for the API's queries.
export function rangeStartIso(firstKey) {
  return new Date(new Date(`${firstKey}T00:00:00Z`).getTime() - UAE_OFFSET_MS).toISOString();
}

const AGE_BANDS = [
  { label: '0 to 7 days', max: 7 },
  { label: '8 to 30 days', max: 30 },
  { label: '31 to 60 days', max: 60 },
  { label: '61 to 90 days', max: 90 },
  { label: 'Over 90 days', max: Infinity },
];

const n = (v) => Number(v || 0);

// A line item's type for "Invoicing by type": its catalog category, except
// that food (products in the Food subcategory) gets a bar of its own.
export function lineItemCategory(goodsService) {
  const main = goodsService?.main_category || 'other';
  const sub = String(goodsService?.catalog_subcategories?.name || '').trim().toLowerCase();
  return main === 'product' && sub === 'food' ? 'food' : main;
}

function sumInto(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount);
}

function sortedEntries(map) {
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function buildChartData({
  unit,
  buckets,
  now = Date.now(),
  payments = [], // { amount, payment_method, paid_at }
  legacyPayments = [], // { amount, payment_method, paid_at }
  invoices = [], // { total, discount_amount, created_at, vet_name }
  discountsGiven = null, // { amount, invoice_id, created_at } per discount, when given
  lineItems = [], // { line_total, category, created_at }
  expenses = [], // { total, category, expense_date }
  clients = [], // { client_number, created_at }
  unpaid = [], // { total, amount_paid, created_at }
}) {
  const inRange = new Set(buckets);
  const blank = () => Object.fromEntries(buckets.map((b) => [b, 0]));

  const takings = { card: blank(), cash: blank(), online: blank(), bank_transfer: blank(), other: blank(), old_system: blank() };
  const collected = blank();
  for (const p of payments) {
    const b = bucketKey(p.paid_at, unit);
    if (!inRange.has(b)) continue;
    takings[invoiceMethodGroup(p.payment_method)][b] += n(p.amount);
    collected[b] += n(p.amount);
  }
  for (const p of legacyPayments) {
    const b = bucketKey(p.paid_at, unit);
    if (inRange.has(b)) takings.old_system[b] += n(p.amount);
  }

  const invoiced = blank();
  const invoiceCount = blank();
  const discounts = blank();
  const discountCount = blank();
  const byVet = new Map();
  for (const inv of invoices) {
    const b = bucketKey(inv.created_at, unit);
    if (!inRange.has(b)) continue;
    invoiced[b] += n(inv.total);
    invoiceCount[b] += 1;
    if (!discountsGiven && n(inv.discount_amount) > 0) {
      discounts[b] += n(inv.discount_amount);
      discountCount[b] += 1;
    }
    sumInto(byVet, inv.vet_name || 'No vet', n(inv.total));
  }
  // A discount counts on the day it was given, not the invoice's date: a
  // supporter bonus (lib/supporterBonus.js) often goes on an older bill.
  // And as what came off the bill, VAT included (a AED 50 bonus is 47.62
  // before VAT), so it matches what the client and the pay page see.
  if (discountsGiven) {
    const seen = new Set();
    for (const d of discountsGiven) {
      const b = bucketKey(d.created_at, unit);
      if (!inRange.has(b)) continue;
      discounts[b] += billAmountForDiscount(n(d.amount));
      if (!seen.has(`${b}:${d.invoice_id}`)) {
        seen.add(`${b}:${d.invoice_id}`);
        discountCount[b] += 1;
      }
    }
  }
  const averageInvoice = Object.fromEntries(buckets.map((b) => [b, invoiceCount[b] ? invoiced[b] / invoiceCount[b] : 0]));

  const byType = new Map();
  const food = blank();
  for (const li of lineItems) {
    sumInto(byType, li.category || 'other', n(li.line_total));
    if (li.category !== 'food' || !li.created_at) continue;
    const b = bucketKey(li.created_at, unit);
    if (inRange.has(b)) food[b] += n(li.line_total);
  }

  const spending = new Map();
  const outgoing = blank();
  for (const e of expenses) {
    const b = bucketKey(e.expense_date, unit);
    if (!inRange.has(b)) continue;
    sumInto(spending, e.category || 'other', n(e.total));
    outgoing[b] += n(e.total);
  }
  const takingsTotal = Object.fromEntries(buckets.map((b) => [b, Object.values(takings).reduce((t, m) => t + m[b], 0)]));

  const newClients = blank();
  for (const c of clients) {
    if (n(c.client_number) <= LAST_IMPORTED_CLIENT_NUMBER) continue;
    const b = bucketKey(c.created_at, unit);
    if (inRange.has(b)) newClients[b] += 1;
  }

  const owed = AGE_BANDS.map((band) => ({ label: band.label, value: 0, count: 0 }));
  for (const inv of unpaid) {
    const balance = n(inv.total) - n(inv.amount_paid);
    if (balance <= 0.005) continue;
    const days = Math.floor((now - new Date(inv.created_at).getTime()) / DAY_MS);
    const i = AGE_BANDS.findIndex((band) => days <= band.max);
    owed[i].value += balance;
    owed[i].count += 1;
  }

  return {
    unit,
    buckets,
    takings,
    takingsTotal,
    outgoing,
    invoiced,
    collected,
    averageInvoice,
    invoiceCount,
    discounts,
    discountCount,
    newClients,
    owed: owed.filter((band, i) => band.count > 0 || i < 3),
    byType: sortedEntries(byType),
    food,
    byVet: sortedEntries(byVet),
    spending: sortedEntries(spending),
  };
}

// The client app (Accounting charts): each phone number that asked for a
// login code, counted once in the period of its first request, and whether
// it went on to log in (a code used before running out of tries). Staff
// numbers are left out. codes: { phone, created_at, consumed_at, attempts }.
export function appLoginStats({ codes = [], unit, buckets, staffPhones = [] }) {
  const inRange = new Set(buckets);
  const blank = () => Object.fromEntries(buckets.map((b) => [b, 0]));
  const skip = new Set(staffPhones);
  const byPhone = new Map();
  for (const c of codes) {
    if (!c.phone || skip.has(c.phone)) continue;
    const p = byPhone.get(c.phone) || { first: c.created_at, loggedIn: false };
    if (Date.parse(c.created_at) < Date.parse(p.first)) p.first = c.created_at;
    if (c.consumed_at && n(c.attempts) < 5) p.loggedIn = true;
    byPhone.set(c.phone, p);
  }
  const asked = blank();
  const loggedIn = blank();
  for (const p of byPhone.values()) {
    const b = bucketKey(p.first, unit);
    if (!inRange.has(b)) continue;
    asked[b] += 1;
    if (p.loggedIn) loggedIn[b] += 1;
  }
  const all = [...byPhone.values()];
  return { asked, loggedIn, totals: { asked: all.length, loggedIn: all.filter((p) => p.loggedIn).length } };
}
