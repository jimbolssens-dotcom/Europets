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

// Hospital stays log every oral dose as its own dispensed item (Jim, 15 Nov).
import { medsFromTreatmentItems as medsOnce, missingMeds as missingOnce } from '../lib/homeCare.js';

test('a medicine logged many times is suggested once, with its newest instructions', () => {
  const doses = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, administration_method: 'dispense', goods_services: { name: 'Doxycare 40mg (Doxycycline) ^' }, instructions: i === 7 ? '' : i < 3 ? '1 tablet once daily' : '1 tablet twice daily for 10 days' }));
  doses.push({ id: 'm1', administration_method: 'dispense', goods_services: { name: 'Meloxivet Gotas 0.5 mg/ml (Oral drops)' }, instructions: '' });
  const meds = medsOnce(doses);
  assert.deepEqual(meds.map((m) => m.name), ['Doxycare 40mg (Doxycycline)', 'Meloxivet Gotas 0.5 mg/ml (Oral drops)']);
  assert.equal(meds[0].dose, '1 tablet twice daily for 10 days');
  assert.equal(meds[0].times_per_day, 2);
  assert.equal(meds[0].days, 10);
});

test('a medicine already on the plan, even under an old per-dose key, is not offered again', () => {
  const suggested = medsOnce([{ id: 't9', administration_method: 'dispense', goods_services: { name: 'Doxycare 40mg (Doxycycline)' } }]);
  assert.equal(missingOnce([{ key: 'm_old-dose-id', kind: 'med', name: 'Doxycare 40mg (Doxycycline)' }], suggested).length, 0);
  assert.equal(missingOnce([], suggested).length, 1);
});

// Course length from what was dispensed (Jim, 16 Nov).
import { courseDays, doseAmountFromText, recalcMedDays, medsFromTreatmentItems as medsDays, cleanItems as cleanDays } from '../lib/homeCare.js';

test('10 tablets twice a day is 5 days; half a tablet makes it 10', () => {
  assert.equal(courseDays({ quantity: 10, catalogUnit: 'tab', instructions: '1 tablet twice daily', timesPerDay: 2 }), 5);
  assert.equal(courseDays({ quantity: 10, catalogUnit: 'tab', instructions: '½ tablet twice daily', timesPerDay: 2 }), 10);
  assert.equal(courseDays({ quantity: 14, catalogUnit: 'tab', instructions: '', timesPerDay: 2 }), 7);
  assert.equal(courseDays({ quantity: 10, catalogUnit: 'tab', instructions: '1 tab three times a day', timesPerDay: 3 }), 3);
  assert.equal(courseDays({ quantity: 30, catalogUnit: 'ml', instructions: '0.4 ml once daily', timesPerDay: 1 }), 75);
  assert.equal(courseDays({ quantity: 1, catalogUnit: 'bottle', instructions: '0.4 ml once daily', timesPerDay: 1 }), null);
  assert.deepEqual(doseAmountFromText('1 1/2 tabs bid'), { amount: 1.5, unit: 'count' });
});

test('the home care line gets the worked-out days, and follows a change of times a day', () => {
  const [med] = medsDays([{ id: 't', administration_method: 'dispense', quantity: 10, instructions: '1 tablet twice daily', goods_services: { name: 'Doxycare 40mg', unit: 'tab' } }]);
  assert.equal(med.times_per_day, 2);
  assert.equal(med.days, 5);
  assert.equal(med.days_auto, true);
  assert.equal(recalcMedDays({ ...med, times_per_day: 1 }).days, 10);
  // Days typed by hand stay as typed.
  assert.equal(recalcMedDays({ ...med, days: 14, days_auto: false, times_per_day: 1 }).days, 14);
  // Written days in the instructions win.
  const [written] = medsDays([{ id: 'u', administration_method: 'dispense', quantity: 10, instructions: '1 tablet twice daily for 3 days', goods_services: { name: 'X', unit: 'tab' } }]);
  assert.equal(written.days, 3);
  // Kept through saving, so it still follows later changes.
  assert.equal(cleanDays([med])[0].supply, 10);
});
