// Items logged together make one worksheet entry (lib/worksheetGrouping.js).
// Replays the 18 Nov day procedure: surgery, sterile surgery, sedation,
// anaesthetic, Megasil, Melosolute, wire and suture logged 13:42 to 13:44,
// unassigned, one entry each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryToJoin, foldPlan, isItemsOnly } from '../lib/worksheetGrouping.js';

const at = (hm) => `2026-11-18T${hm}:00+04:00`;
const entry = (id, hm, extra = {}) => ({ id, note_date: '2026-11-18', created_at: at(hm), author_id: null, notes: null, plan_item_ids: [], ...extra });

test('an item-only entry joins the last one within 5 minutes', () => {
  const now = Date.parse(at('13:44'));
  assert.equal(entryToJoin(entry('a', '13:42'), { note_date: '2026-11-18' }, now)?.id, 'a');
  assert.equal(entryToJoin(entry('a', '13:30'), { note_date: '2026-11-18' }, now), null); // too long ago
  assert.equal(entryToJoin(entry('a', '13:42', { notes: 'Split palate' }), { note_date: '2026-11-18' }, now), null); // has text
  assert.equal(entryToJoin(entry('a', '13:42', { author_id: 's1' }), { note_date: '2026-11-18' }, now), null); // someone else
  assert.equal(entryToJoin(entry('a', '13:42', { temperature_c: 39.9 }), { note_date: '2026-11-18' }, now), null); // a reading
});

test('a request with text, a reading or a plan tap is not item-only', () => {
  assert.equal(isItemsOnly({ treatment_items: [{}] }), true);
  assert.equal(isItemsOnly({ notes: 'x', treatment_items: [{}] }), false);
  assert.equal(isItemsOnly({ plan_item_ids: ['p'], treatment_items: [{}] }), false);
  assert.equal(isItemsOnly({ has_photos: true }), false);
});

test('Move to Hospital folds the day procedure item entries into the first', () => {
  const notes = ['13:42', '13:42', '13:43', '13:43', '13:44'].map((hm, i) => entry(`e${i}`, hm));
  notes.push(entry('text', '13:34', { notes: 'Split palate' }));
  const plan = foldPlan(notes);
  assert.equal(plan.target.id, 'e0');
  assert.deepEqual(plan.others.map((n) => n.id), ['e1', 'e2', 'e3', 'e4']);
  // An entry with a photo attached stays on its own.
  assert.deepEqual(foldPlan(notes, new Set(['e4'])).others.map((n) => n.id), ['e1', 'e2', 'e3']);
  assert.equal(foldPlan([entry('one', '13:42')]), null);
});
