// lib/dictatedItems.js
// Billable items heard in a consult dictation (lib/recordingProcessing.js)
// are only logged when they aren't on the consult already. Jim: tests and
// other items are often logged by hand before the report is dictated, and
// hearing "we ran a snap test" then logged it a second time. So an item
// already on the consult's treatment plan or diagnostics is skipped, and
// so is the same item heard twice in one dictation. Pure, so it can be
// tested (tests/dictated-items.test.mjs).

// matches: [{ goods_service_id, ...anything }] in the order heard.
// alreadyLogged: goods_service_ids already on the consult.
export function itemsNotYetLogged(matches, alreadyLogged) {
  const seen = new Set((alreadyLogged || []).filter(Boolean));
  const fresh = [];
  for (const m of matches || []) {
    if (!m?.goods_service_id || seen.has(m.goods_service_id)) continue;
    seen.add(m.goods_service_id);
    fresh.push(m);
  }
  return fresh;
}
