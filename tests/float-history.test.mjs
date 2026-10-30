import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFloatDaysCsv,
  appMonths,
  combinedMonths,
  yearOnYear,
  dailyTakings,
  weekdayAverages,
  monthToDate,
  trailingYears,
  costMix,
  nextMonth,
} from '../lib/floatHistory.js';
import { OLD_FLOAT_DAY_COLUMNS, OLD_FLOAT_DAYS_CSV } from '../data/oldFloatDays.js';

test('the shipped day rows parse, one per spreadsheet row', () => {
  const rows = parseFloatDaysCsv(OLD_FLOAT_DAYS_CSV, OLD_FLOAT_DAY_COLUMNS);
  assert.equal(rows.length, 1136);
  assert.equal(new Set(rows.map((r) => `${r.sheet}:${r.sheet_row}`)).size, rows.length);
  const first = rows[0];
  assert.deepEqual([first.sheet, first.sheet_row, first.day, first.shift, first.closed, first.staff], ['Jan 25', 2, '2025-01-01', 1, true, 3000]);
  // Sep 2025 adds up from its rows, not the sheet's short total.
  const sep = rows.filter((r) => r.day.startsWith('2025-09')).reduce((t, r) => t + r.takings, 0);
  assert.equal(Math.round(sep), 325095);
  assert.ok(rows.every((r) => r.day >= '2025-01-01' && r.day <= '2026-09-30'));
});

test('nextMonth rolls the year', () => {
  assert.equal(nextMonth('2025-12-01'), '2026-01-01');
  assert.equal(nextMonth('2026-09-01'), '2026-10-01');
});

test('the float runs to September, the app from October; costs follow the float only while complete', () => {
  const floatMonths = [
    { month: '2026-08-01', takings: 300, cash: 30, card: 200, online: 70, outgoing: 180, net_profit: 40, fixed_costs: 80, costs_complete: true },
    { month: '2026-09-01', takings: 310, cash: 31, card: 200, online: 79, outgoing: 88, net_profit: null, fixed_costs: 0, costs_complete: false },
  ];
  const app = appMonths({
    payments: [
      { amount: 100, payment_method: 'cash', paid_at: '2026-09-20T08:00:00Z' },
      { amount: 50, payment_method: 'payment_link', paid_at: '2026-10-02T08:00:00Z' },
      { amount: 20, payment_method: 'card', paid_at: '2026-09-30T21:00:00Z' }, // 1 Oct in the UAE
    ],
    legacyPayments: [{ amount: 5, payment_method: 'Cash', paid_at: '2026-10-05T08:00:00Z' }],
    expenses: [{ total: 250, expense_date: '2026-09-10' }, { total: 90, expense_date: '2026-10-10' }],
  });
  const months = combinedMonths({ floatMonths, app, now: Date.parse('2026-10-15T08:00:00Z') });
  assert.deepEqual(months.map((m) => m.month), ['2026-08-01', '2026-09-01', '2026-10-01']);
  assert.deepEqual(months.map((m) => [m.source, m.takings, m.costSource, m.outgoing, m.netProfit]), [
    ['old', 300, 'old', 260, 40],
    ['old', 310, 'app', 250, null],
    ['app', 75, 'app', 90, null],
  ]);
  assert.deepEqual([months[2].cash, months[2].card, months[2].online], [5, 20, 50]);
});

test('a one-off cost is left out of outgoing and net profit', () => {
  const [m] = combinedMonths({
    floatMonths: [{ month: '2023-09-01', takings: 243, outgoing: 534, net_profit: -347, fixed_costs: 77, costs_complete: true, one_off_costs: 374, one_off_note: 'Property purchase' }],
    now: Date.parse('2023-09-15T08:00:00Z'),
  });
  assert.deepEqual([m.outgoing, m.netProfit, m.oneOff, m.oneOffNote], [237, 27, 374, 'Property purchase']);
});

test('year on year puts each month under its calendar year', () => {
  const yoy = yearOnYear([{ month: '2025-12-01', takings: 10 }, { month: '2026-01-01', takings: 20 }, { month: '2026-02-01', takings: 0 }]);
  assert.deepEqual(yoy.years, ['2025', '2026']);
  assert.equal(yoy.values['2025'][11], 10);
  assert.equal(yoy.values['2026'][0], 20);
  assert.equal(yoy.values['2026'][1], null);
});

test('daily takings: both cash-ups, no cost-only rows, the app from October', () => {
  const days = dailyTakings({
    floatDays: [
      { day: '2026-09-28', shift: 1, takings: 100 },
      { day: '2026-09-28', shift: 2, takings: 50 },
      { day: '2026-09-01', shift: 0, takings: 0 },
    ],
    payments: [
      { amount: 999, paid_at: '2026-09-28T08:00:00Z' }, // already in the float
      { amount: 70, paid_at: '2026-10-05T08:00:00Z' },
    ],
  });
  assert.deepEqual([...days.entries()].sort(), [['2026-09-28', 150], ['2026-10-05', 70]]);
  const avg = weekdayAverages(new Map([['2026-09-28', 150], ['2026-10-05', 70], ['2026-10-04', 0]]));
  assert.equal(avg[0].label, 'Monday');
  assert.equal(avg[0].value, 110); // both Mondays
  assert.equal(avg[6].count, 0); // the Sunday took nothing
});

test('month to date compares the same days in earlier years', () => {
  const days = new Map([['2026-10-01', 10], ['2026-10-02', 20], ['2026-10-03', 99], ['2025-10-01', 5], ['2025-10-02', 5], ['2025-10-03', 1000]]);
  const mtd = monthToDate(days, Date.parse('2026-10-02T12:00:00Z'));
  assert.equal(mtd.throughDay, 2);
  assert.deepEqual(mtd.rows, [{ year: '2026', total: 30 }, { year: '2025', total: 10 }]);
});

test('trailing years need 24 full months', () => {
  const months = [];
  for (let k = '2024-09-01'; k <= '2026-10-01'; k = nextMonth(k)) months.push({ month: k, takings: k < '2025-10-01' ? 1 : 2 });
  const t = trailingYears(months, Date.parse('2026-10-15T08:00:00Z'));
  assert.deepEqual(t, { from: '2025-10-01', to: '2026-09-01', takings: 24, priorTakings: 12 });
  assert.equal(trailingYears(months.slice(0, 10), Date.parse('2026-10-15T08:00:00Z')), null);
});

test('cost mix averages the complete daily-sheet months only', () => {
  const mix = costMix({
    floatMonths: [
      { month: '2025-01-01', source: 'daily sheets', costs_complete: true, wps_salaries: 100, sponsor: 10 },
      { month: '2026-09-01', source: 'daily sheets', costs_complete: false, wps_salaries: 999 },
    ],
    floatDays: [
      { day: '2025-01-03', stock: 40, staff: 60 },
      { day: '2025-01-15', staff: 50000 },
      { day: '2026-09-03', stock: 500 },
    ],
  });
  assert.equal(mix.months, 1);
  // Dr Jim's salary: its own bar, not in the other staff.
  assert.deepEqual(mix.rows.map((r) => [r.key, r.value]), [['owner_salary', 50000], ['wps_salaries', 100], ['staff', 60], ['stock', 40], ['sponsor', 10]]);
});
