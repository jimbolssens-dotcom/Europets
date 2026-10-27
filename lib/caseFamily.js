// lib/caseFamily.js
// Every consult and hospitalization row (a stay or a day procedure) linked
// into one case: a consult that became a day procedure and then a stay
// (originating_visit_id), a procedure spun off a stay or the other way round
// (originating_hospitalization_id). Used server-side so a case's photos show
// on all of them, and on the client's live updates page, wherever they were
// taken (Jim: photos made under the consult weren't showing on the stay).
// The client-side twin for reports is lib/caseReportScope.js. Takes the
// database client, so it can be tested with a fake one
// (tests/case-family.test.mjs).

const MAX_ROWS = 30;

export async function caseFamily(db, { visitId = null, hospitalizationId = null }) {
  const visits = new Set(visitId ? [visitId] : []);
  const stays = new Set(hospitalizationId ? [hospitalizationId] : []);
  let newVisits = [...visits];
  let newStays = [...stays];
  for (let round = 0; round < 5 && (newVisits.length || newStays.length); round++) {
    const queries = [];
    if (newVisits.length) queries.push(db.from('hospitalizations').select('id, originating_visit_id, originating_hospitalization_id').in('originating_visit_id', newVisits));
    if (newStays.length) {
      queries.push(db.from('hospitalizations').select('id, originating_visit_id, originating_hospitalization_id').in('id', newStays));
      queries.push(db.from('hospitalizations').select('id, originating_visit_id, originating_hospitalization_id').in('originating_hospitalization_id', newStays));
    }
    const results = await Promise.all(queries);
    newVisits = [];
    newStays = [];
    for (const { data } of results) {
      for (const h of data || []) {
        for (const s of [h.id, h.originating_hospitalization_id]) {
          if (s && !stays.has(s) && stays.size + visits.size < MAX_ROWS) {
            stays.add(s);
            newStays.push(s);
          }
        }
        const v = h.originating_visit_id;
        if (v && !visits.has(v) && stays.size + visits.size < MAX_ROWS) {
          visits.add(v);
          newVisits.push(v);
        }
      }
    }
  }
  return { visitIds: [...visits], hospitalizationIds: [...stays] };
}
