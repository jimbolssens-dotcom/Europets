// lib/worksheetTests.js
// A test logged in a hospital stay's worksheet entry (a catalog item from
// the Tests category, e.g. "Giardia/Parvo/CoV Combo") also becomes one of
// the stay's tests, so it shows under Reports, in the client portal's test
// list and in the test-report PDF (lib/stayDiagnostics.js), the same as a
// test ordered from the stay's Tests panel (app/api/diagnostics, which goes
// the other way: test first, then the worksheet line). Jim, 5 Nov: a stool
// combo logged with its result in the worksheet never showed under Reports.
//
// The entry's own text is taken as the result when it reads like one ("It
// came back positive for coronavirus and negative for Giardia and parvo"),
// never for the automatic "Test ordered: ..." line or a general update. Linked by treatment_item_id, so it's
// never created twice for the same line. Best-effort: a failure here never
// loses the worksheet entry itself.

// Only an entry that reads like a result becomes the test's result (Jim,
// 11 Nov): a general update that merely mentions the test ("a respiratory
// PCR test was run, the team will keep an eye on her") stays a worksheet
// log, and the test's result stays empty until the lab report is in.
const RESULT_WORDS = /\b(positive|negative|pos|neg|detected|not detected|reactive|non-?reactive|came back|results? (?:is|are|was|were|show|showed)|showed|titr?e|titer|equivocal|inconclusive)\b|\d+(?:[.,]\d+)?\s*(?:mmol|µmol|umol|mg\/dl|g\/l|g\/dl|u\/l|iu\/l|x\s*10|%|ng\/ml)/i;
export function looksLikeTestResult(text) {
  return RESULT_WORDS.test(String(text || ''));
}

export function testRowsForWorksheetItems(items, { hospitalizationId, noteText }) {
  const text = (noteText || '').trim();
  const result = text && !/^Test ordered:/i.test(text) && looksLikeTestResult(text) ? text : null;
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
    // Photos already on the entry (an item added to a saved entry).
    const noteIds = [...new Set((items || []).map((i) => i.hospitalization_note_id).filter(Boolean))];
    for (const noteId of noteIds) await copyNotePhotosToTests(db, noteId);
  } catch (err) {
    console.error('Failed to record worksheet tests', hospitalizationId, err);
  }
}

// The entry's photos and files (a picture of the test strip, a lab printout)
// also go on its tests, so they show with the result under Reports (Jim,
// 5 Nov). The same stored file, linked twice: removing either link leaves
// the file for the other (app/api/attachments/[id] only deletes the file
// once nothing links to it). Called when the test is recorded and whenever
// a photo is added to the entry later.
export function testPhotoRows(noteAttachments, tests, existingTestAttachments) {
  const have = new Set((existingTestAttachments || []).map((a) => `${a.entity_id}|${a.file_path}`));
  const rows = [];
  for (const test of tests || []) {
    for (const a of noteAttachments || []) {
      if (have.has(`${test.id}|${a.file_path}`)) continue;
      rows.push({ entity_type: 'diagnostic', entity_id: test.id, file_path: a.file_path, file_name: a.file_name || null, content_type: a.content_type || null, uploaded_by: a.uploaded_by || null });
    }
  }
  return rows;
}

export async function copyNotePhotosToTests(db, noteId) {
  try {
    const { data: items } = await db.from('treatment_items').select('id').eq('hospitalization_note_id', noteId);
    const itemIds = (items || []).map((i) => i.id);
    if (!itemIds.length) return;
    const { data: tests } = await db.from('diagnostics').select('id').in('treatment_item_id', itemIds);
    if (!tests?.length) return;
    const { data: noteAttachments } = await db
      .from('attachments')
      .select('file_path, file_name, content_type, uploaded_by')
      .eq('entity_type', 'hospitalization_note')
      .eq('entity_id', noteId);
    if (!noteAttachments?.length) return;
    const { data: existing } = await db
      .from('attachments')
      .select('entity_id, file_path')
      .eq('entity_type', 'diagnostic')
      .in('entity_id', tests.map((t) => t.id));
    const rows = testPhotoRows(noteAttachments, tests, existing);
    if (!rows.length) return;
    const { error } = await db.from('attachments').insert(rows);
    if (error) console.error('Failed to copy worksheet photos to tests', noteId, error.message);
  } catch (err) {
    console.error('Failed to copy worksheet photos to tests', noteId, err);
  }
}
