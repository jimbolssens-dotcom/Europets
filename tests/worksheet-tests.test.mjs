import test from 'node:test';
import assert from 'node:assert/strict';
import { testRowsForWorksheetItems, recordWorksheetTests } from '../lib/worksheetTests.js';

const combo = { id: 't1', goods_service_id: 'g-combo', instructions: null, goods_services: { name: 'Giadra/Parvo/CoV Combo', main_category: 'test' } };
const med = { id: 't2', goods_service_id: 'g-mirataz', instructions: 'Apply to ear', goods_services: { name: 'Mirataz ointment', main_category: 'product' } };
const resultText = 'A combined stool test was run for Giardia, coronavirus and parvo. It came back positive for coronavirus and negative for Giardia and parvo.';

test('a test logged in a worksheet entry becomes one of the stay tests, with the entry text as result', () => {
  const rows = testRowsForWorksheetItems([combo, med], { hospitalizationId: 'h1', noteText: resultText });
  assert.deepEqual(rows, [{ hospitalization_id: 'h1', goods_service_id: 'g-combo', treatment_item_id: 't1', description: null, result: resultText }]);
});

test('medications and services are not tests', () => {
  assert.deepEqual(testRowsForWorksheetItems([med], { hospitalizationId: 'h1', noteText: 'x' }), []);
});

test('the automatic "Test ordered" line is not a result', () => {
  const [row] = testRowsForWorksheetItems([combo], { hospitalizationId: 'h1', noteText: 'Test ordered: Giadra/Parvo/CoV Combo' });
  assert.equal(row.result, null);
});

function fakeDb(existing = []) {
  const inserted = [];
  return {
    inserted,
    from: () => ({
      select: () => ({ in: async () => ({ data: existing.map((id) => ({ treatment_item_id: id })) }) }),
      insert: async (rows) => { inserted.push(...rows); return { error: null }; },
    }),
  };
}

test('records the test once, never twice for the same worksheet line', async () => {
  const db = fakeDb();
  await recordWorksheetTests(db, { hospitalizationId: 'h1', items: [combo, med], noteText: resultText });
  assert.equal(db.inserted.length, 1);
  const again = fakeDb(['t1']);
  await recordWorksheetTests(again, { hospitalizationId: 'h1', items: [combo], noteText: resultText });
  assert.equal(again.inserted.length, 0);
});

import { testPhotoRows } from '../lib/worksheetTests.js';

test('the entry photo (the test strip) is linked to the test too, once', () => {
  const photo = { file_path: 'hospitalization_note/n1/strip.jpg', file_name: 'strip.jpg', content_type: 'image/jpeg' };
  const rows = testPhotoRows([photo], [{ id: 'd1' }], []);
  assert.deepEqual(rows, [{ entity_type: 'diagnostic', entity_id: 'd1', file_path: photo.file_path, file_name: 'strip.jpg', content_type: 'image/jpeg', uploaded_by: null }]);
  assert.deepEqual(testPhotoRows([photo], [{ id: 'd1' }], [{ entity_id: 'd1', file_path: photo.file_path }]), []);
});
