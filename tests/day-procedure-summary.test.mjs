// "Move to Hospital": the day procedure becomes one worksheet entry on the
// new stay (lib/dayProcedureSummary.js). Replays the 18 Nov case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayProcedureSummary } from '../lib/dayProcedureSummary.js';

const n = (hm, notes, items = []) => ({ created_at: `2026-11-18T${hm}:00+04:00`, notes, treatment_items: items.map((name) => ({ goods_services: { name } })) });

test('the whole day procedure in one entry, each item once, nothing repeated', () => {
  const text = dayProcedureSummary([
    n('12:23', 'Castration cat', ['Castration cat']),
    n('13:29', 'Dental cat (15min)', ['Dental cat (15min)']),
    n('13:48', 'Ultrasound — bladder and blood in urine'),
    n('13:48', 'Urine small + sg', ['Urine small + sg']),
    n('13:56', '', ['Dental extraction', 'Dental extraction', 'Anest cat (30min)', 'Dental Xray']),
    n('14:03', 'Ultrasound with Report', ['Ultrasound with Report']),
    n('11:00', 'Synced automatically from the consult.'),
  ], { dateLabel: '18 Nov' });
  assert.equal(text, [
    'From the day procedure on 18 Nov.',
    'Done and given: Castration cat, Dental cat (15min), Urine small + sg, Dental extraction ×2, Anest cat (30min), Dental Xray, Ultrasound with Report.',
    'Notes: Ultrasound — bladder and blood in urine.',
    "Billed on the day procedure's invoice.",
  ].join('\n'));
});
