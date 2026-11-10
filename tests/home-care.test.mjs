import test from 'node:test';
import assert from 'node:assert/strict';
import {
  timesPerDayFromText, daysFromText, cleanMedName, medsFromTreatmentItems, applyTemplate, cleanItems,
  planLastDay, planActiveOn, todayChecklist, dosesLeft, adherence, validateLog, temperatureWarning, logLine, planDayNumber,
} from '../lib/homeCare.js';

test('frequency and length are read from label instructions', () => {
  assert.equal(timesPerDayFromText('0.3 ml by mouth once daily with food for 5 days'), 1);
  assert.equal(timesPerDayFromText('½ tablet twice daily'), 2);
  assert.equal(timesPerDayFromText('3 drops every 8h'), 3);
  assert.equal(timesPerDayFromText('give with food'), null);
  assert.equal(daysFromText('once daily for 5 days'), 5);
  assert.equal(daysFromText('twice daily for 2 weeks'), 14);
  assert.equal(daysFromText('as needed'), null);
});

test('dispensed items become medicines with a clean name', () => {
  assert.equal(cleanMedName('Metacam Oral Suspension Cat 0.5mg/ml 15ml ^'), 'Metacam Oral Suspension Cat 0.5mg/ml 15ml');
  assert.equal(cleanMedName('Convenia 80mg/ml - (Per ml)'), 'Convenia 80mg/ml');
  const meds = medsFromTreatmentItems([
    { id: 'a', administration_method: 'dispense', instructions: '0.3 ml once daily for 5 days', goods_services: { name: 'Metacam ^' } },
    { id: 'b', administration_method: 'sc', instructions: '', goods_services: { name: 'Convenia' } },
    { id: 'c', administration_method: 'dispense', instructions: '', goods_services: { name: 'Synulox 50mg' } },
  ]);
  assert.equal(meds.length, 2);
  assert.deepEqual([meds[0].name, meds[0].times_per_day, meds[0].days], ['Metacam', 1, 5]);
  assert.deepEqual([meds[1].times_per_day, meds[1].days], [1, 7]);
});

test('a template adds its lines once', () => {
  const once = applyTemplate([], 'castration');
  const twice = applyTemplate(once, 'castration');
  assert.equal(once.length, twice.length);
  assert.ok(once.some((i) => i.kind === 'watch'));
  assert.ok(once.some((i) => i.key === 't_check_wound' && i.kind === 'task'));
});

test('items are cleaned before saving', () => {
  const items = cleanItems([
    { key: 'x', kind: 'med', name: ' Metacam ', times_per_day: 9, days: 0 },
    { key: 'x', kind: 'med', name: 'dup' },
    { kind: 'task', text: '' },
    { kind: 'bogus', text: 'no' },
    { key: 'w', kind: 'watch', text: 'Vomiting', days: 5 },
  ]);
  assert.equal(items.length, 2);
  assert.deepEqual([items[0].name, items[0].times_per_day, items[0].days], ['Metacam', 4, 1]);
  assert.equal(items[1].days, undefined);
});

const plan = {
  id: 'p1',
  starts_on: '2026-11-10',
  items: [
    { key: 'm1', kind: 'med', name: 'Metacam', times_per_day: 1, days: 5 },
    { key: 'm2', kind: 'med', name: 'Synulox', times_per_day: 2, days: 7 },
    { key: 't1', kind: 'task', text: 'Check the wound', days: 10 },
    { key: 'k1', kind: 'keep', text: 'Cone on', days: null },
    { key: 'w1', kind: 'watch', text: 'Vomiting' },
  ],
};

test('a plan runs until its longest line ends', () => {
  assert.equal(planLastDay(plan), '2026-11-23'); // the open-ended cone line runs 14 days
  assert.equal(planLastDay({ starts_on: '2026-11-10', items: [plan.items[0], plan.items[1]] }), '2026-11-16');
  assert.equal(planActiveOn(plan, '2026-11-09'), false);
  assert.deepEqual(planDayNumber({ starts_on: '2026-11-10', items: [plan.items[1]] }, '2026-11-11'), { day: 2, total: 7 });
});

test("today's checklist counts each dose", () => {
  const logs = [{ plan_id: 'p1', kind: 'dose', item_key: 'm2', for_date: '2026-11-11', slot: 0 }];
  const rows = todayChecklist(plan, logs, '2026-11-11');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1].slots.map((s) => [s.label, s.done]), [['morning', true], ['evening', false]]);
  assert.equal(dosesLeft(plan, logs, '2026-11-11'), 3);
  assert.equal(todayChecklist(plan, [], '2026-11-14').length, 3); // Metacam's last day
  assert.equal(todayChecklist(plan, [], '2026-11-15').length, 2);
});

test('missed doses are counted for the days before today', () => {
  const logs = [
    { plan_id: 'p1', kind: 'dose', item_key: 'm1', for_date: '2026-11-10', slot: 0 },
    { plan_id: 'p1', kind: 'dose', item_key: 'm2', for_date: '2026-11-10', slot: 0 },
    { plan_id: 'p1', kind: 'dose', item_key: 'm2', for_date: '2026-11-10', slot: 1 },
  ];
  assert.deepEqual(adherence(plan, logs, '2026-11-11'), { expected: 4, ticked: 3, missed: 1 });
});

test('owner logs are checked', () => {
  assert.ok(validateLog({ kind: 'deworm', product: 'Vermis-EX' }).row);
  assert.equal(validateLog({ kind: 'deworm' }).error, 'Which product?');
  assert.equal(validateLog({ kind: 'temperature', value: '39,8' }).row.value, 39.8);
  assert.ok(validateLog({ kind: 'temperature', value: '102' }).error);
  assert.ok(validateLog({ kind: 'eating', product: 'Ate well' }).row);
  assert.ok(validateLog({ kind: 'note' }).error);
  assert.ok(validateLog({ kind: 'weight', value: 4.1, given_at: '2099-01-01' }).error);
  assert.ok(validateLog({ kind: 'dose' }).error); // ticks go through their own route
});

test('a temperature over 39.5 warns the owner', () => {
  assert.equal(temperatureWarning(39.5), false);
  assert.equal(temperatureWarning(39.8), true);
});

test('log lines read plainly', () => {
  assert.equal(logLine({ kind: 'dose', item_key: 'm2', slot: 1 }, plan), '💊 Synulox · evening');
  assert.equal(logLine({ kind: 'deworm', product: 'Vermis-EX' }), '🪱 Vermis-EX (dewormed)');
  assert.equal(logLine({ kind: 'weight', value: 4.1 }), '⚖️ 4.1 kg');
});
