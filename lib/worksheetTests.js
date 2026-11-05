// lib/worksheetTests.js
// A test logged in a hospital stay's worksheet entry (a catalog item from
// the Tests category, e.g. "Giardia/Parvo/CoV Combo") also becomes one of
// the stay's tests, so it shows under Reports, in the client portal's test
// list and in the test-report PDF (lib/stayDiagnostics.js), the same as a
// test ordered from the stay's Tests panel (app/api/diagnostics, which goes
// the other way: test first, then the worksheet line). Jim, 5 Nov: a stool
// combo logged with its result in the worksheet never showed under Reports.
//
// The entry's own text is taken as the result ("It came back positive for
// coronavirus and negative for Giardia and parvo"), unless it's the
// automatic "Test ordered: ..." line. Linked by treatment_item_id, so it's
// never created twice for the same line. Best-effort: a failure here never
// loses the worksheet entry itself.

export function testRowsForWorksheetItems(items, { hospitalizationId, noteText }) {
  const result = noteText && !/^Test ordered:/i.test(noteText.trim()) ? noteText.trim() : null;
  return (items || [])
    .filter((item) => item?.id && item.goods_service_id && item.goods_services?.main_category === 'test')
    .map((item) => ({
      hospitalization_id: hospitalizationId,
      goods_service_id: item.goods_service_id,
      treatment_item_id: item.id,
      description: item.instructions || null,
      result,
    }));
}

export async function recordWorksheetTests(db, { hospitalizationId, items, noteText }) {
  try {
    const rows = testRowsForWorksheetItems(items, { hospitalizationId, noteText });
    if (!hospitalizationId || rows.length === 0) return;
    const { data: existing } = await db
      .from('diagnostics')
      .select('treatment_item_id')
      .in('treatment_item_id', rows.map((r) => r.treatment_item_id));
    const already = new Set((existing || []).map((d) => d.treatment_item_id));
    const fresh = rows.filter((r) => !already.has(r.treatment_item_id));
    if (fresh.length === 0) return;
    const { error } = await db.from('diagnostics').insert(fresh);
    if (error) console.error('Failed to record worksheet tests', hospitalizationId, error.message);
  } catch (err) {
    console.error('Failed to record worksheet tests', hospitalizationId, err);
  }
}
